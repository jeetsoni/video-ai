# Bugfix Requirements Document

## Introduction

Voiceover audio (ElevenLabs TTS) intermittently fails to play during Remotion Player video preview. Users report that audio plays only occasionally, requiring repeated page refreshes to hear the voiceover. The audio works correctly in the final rendered/downloaded output. This bug degrades the preview experience and makes it unreliable for reviewing voiceover timing and quality before export.

The root causes are: (1) MinIO signed URLs expire after 1 hour with no refresh mechanism, (2) preview data is fetched only once on mount with no re-fetch when audio URLs become stale, (3) the `<Audio>` component in `CompositionWrapper` has no preloading, error detection, or retry logic, and (4) if TTS generation completes while the user is already viewing the preview stage, the audio URL is never picked up without a manual refresh.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a signed audio URL expires (after 3600 seconds) and the user plays the preview THEN the system silently fails to play voiceover audio with no error indication to the user

1.2 WHEN the `usePreviewData` hook fetches preview data on mount and the audio URL later becomes invalid THEN the system continues using the stale URL without refreshing it, resulting in silent audio failure

1.3 WHEN the Remotion `<Audio>` component fails to load the audio resource (expired URL, network error, or race condition) THEN the system provides no error feedback and does not attempt to recover or retry

1.4 WHEN TTS generation completes after the user has already navigated to a preview-eligible stage THEN the system does not re-fetch preview data, so the audio URL remains null until the user manually refreshes the page

1.5 WHEN the audio URL fails during playback THEN the `audioError` flag in the response only reflects a missing `audioPath` on the backend, not a client-side URL loading failure, leaving the user with no visible indication of the problem

### Expected Behavior (Correct)

2.1 WHEN a signed audio URL is approaching expiry or has expired THEN the system SHALL automatically refresh the signed URL by re-fetching preview data before playback, ensuring the user always has a valid audio URL

2.2 WHEN preview data has been fetched and the audio URL may have become stale THEN the system SHALL periodically or on-demand re-fetch preview data to obtain a fresh signed URL, preventing silent audio failures

2.3 WHEN the Remotion `<Audio>` component fails to load the audio resource THEN the system SHALL detect the failure, display an actionable error message to the user, and attempt to recover by fetching a fresh audio URL

2.4 WHEN TTS generation completes while the user is on a preview-eligible stage THEN the system SHALL re-fetch preview data to pick up the newly available audio URL without requiring a manual page refresh

2.5 WHEN audio playback fails on the client side THEN the system SHALL surface a visible error state to the user (distinct from the backend `audioError` flag) indicating that voiceover audio could not be loaded, with an option to retry

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the audio URL is valid and the network is stable THEN the system SHALL CONTINUE TO play voiceover audio correctly in the Remotion Player preview without interruption

3.2 WHEN the user navigates to a preview-eligible stage and preview data is fetched successfully on first load THEN the system SHALL CONTINUE TO render the video preview with the evaluated component and scene plan as before

3.3 WHEN the backend `audioPath` is missing for a job THEN the system SHALL CONTINUE TO set `audioError: true` and display the "Audio unavailable" indicator in the action bar

3.4 WHEN the user clicks "Regenerate" or "Download MP4" THEN the system SHALL CONTINUE TO trigger the corresponding actions without interference from the audio refresh mechanism

3.5 WHEN the final rendered video is downloaded THEN the system SHALL CONTINUE TO include correctly working voiceover audio in the output file, as this path is unaffected by the preview URL issue

3.6 WHEN the user is on a non-preview-eligible stage (before "preview") THEN the system SHALL CONTINUE TO show the existing `VideoPreviewSection` component without attempting audio URL refresh logic

---

## Bug Condition (Formal)

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PreviewPlaybackInput { audioUrl: string | null, urlAge: seconds, networkAvailable: boolean, ttsCompleted: boolean, stageIsPreviewEligible: boolean }
  OUTPUT: boolean

  // The bug triggers when the audio URL is stale/expired, or when TTS completed
  // after initial fetch, or when the audio resource fails to load on the client
  RETURN (X.audioUrl IS NOT NULL AND X.urlAge >= 3600)
      OR (X.ttsCompleted AND X.audioUrl IS NULL AND X.stageIsPreviewEligible)
      OR (X.audioUrl IS NOT NULL AND audioResourceFailsToLoad(X.audioUrl))
END FUNCTION
```

### Property Specification — Fix Checking

```pascal
// Property: Fix Checking — Audio URL is always valid during preview playback
FOR ALL X WHERE isBugCondition(X) DO
  result ← previewPlayback'(X)
  ASSERT result.audioUrl IS valid AND NOT expired
     AND result.audioPlays = true
     AND result.errorFeedbackShown = true WHEN recovery fails
END FOR
```

### Property Specification — Preservation Checking

```pascal
// Property: Preservation Checking — Non-buggy playback is unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT previewPlayback(X) = previewPlayback'(X)
END FOR
```

This ensures that for all inputs where the audio URL is valid, fresh, and loads successfully, the fixed code behaves identically to the original.
