# Voiceover Playback Fix — Bugfix Design

## Overview

Voiceover audio in the Remotion Player preview intermittently fails because MinIO signed URLs expire after 1 hour with no refresh mechanism, the `usePreviewData` hook fetches data only once on mount, the `<Audio>` component has no error handling or retry logic, and late-arriving TTS results are never picked up. The fix introduces a proactive URL refresh interval in the frontend hook, audio error detection and recovery in the Remotion composition, and a client-side audio error state surfaced to the user — all without modifying the backend use case or the signed URL expiry itself.

## Glossary

- **Bug_Condition (C)**: The set of inputs where voiceover audio fails to play in preview — expired signed URL, stale fetch with no refresh, audio resource load failure, or TTS completing after initial mount
- **Property (P)**: The desired behavior — audio always plays with a valid URL, errors are detected and surfaced, and recovery is attempted automatically
- **Preservation**: Existing behaviors that must remain unchanged — valid-URL playback, first-load rendering, backend `audioError` flag, Regenerate/Download actions, non-preview stages
- **`usePreviewData`**: The React hook in `apps/web/src/features/pipeline/hooks/use-preview-data.ts` that fetches preview data (code, scenePlan, audioUrl) once on mount
- **`RemotionPreviewPlayer`**: The component in `apps/web/src/features/pipeline/components/remotion-preview-player.tsx` that renders the Remotion `<Player>` with a `CompositionWrapper` containing the `<Audio>` element
- **`GetPreviewDataUseCase`**: The backend use case in `apps/api/src/pipeline/application/use-cases/get-preview-data.use-case.ts` that generates a fresh signed URL on each call
- **`MinioObjectStore`**: The infrastructure service in `apps/api/src/pipeline/infrastructure/services/minio-object-store.ts` that creates signed URLs with a configurable expiry (default 3600s)
- **Signed URL expiry**: The 3600-second TTL on MinIO/S3 presigned URLs after which the URL returns 403/expired

## Bug Details

### Bug Condition

The bug manifests when a user is on a preview-eligible stage and voiceover audio fails to play. The `usePreviewData` hook fetches preview data exactly once on mount and never refreshes it. The `CompositionWrapper` renders `<Audio src={audioUrl} />` with no error handling. If the signed URL expires, the audio resource fails to load, or TTS completes after the initial fetch, the user hears silence with no error indication.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type PreviewPlaybackInput {
    audioUrl: string | null,
    urlAgeSeconds: number,
    audioResourceLoads: boolean,
    ttsCompletedAfterMount: boolean,
    stageIsPreviewEligible: boolean
  }
  OUTPUT: boolean

  RETURN input.stageIsPreviewEligible
     AND (
       (input.audioUrl IS NOT NULL AND input.urlAgeSeconds >= 3600)
       OR (input.audioUrl IS NOT NULL AND NOT input.audioResourceLoads)
       OR (input.ttsCompletedAfterMount AND input.audioUrl IS NULL)
     )
END FUNCTION
```

### Examples

- **Expired URL**: User opens preview, waits 65 minutes, presses play → audio silently fails (expected: audio plays with a refreshed URL)
- **Network blip**: Audio URL is valid but a transient network error causes the `<Audio>` element to fail loading → silent failure, no error shown (expected: error message displayed, automatic retry attempted)
- **Late TTS**: User navigates to preview stage while TTS is still generating. TTS completes 30 seconds later → audioUrl remains null until manual page refresh (expected: hook re-fetches and picks up the new audioUrl)
- **Immediate replay**: User plays preview immediately after page load with a fresh URL → audio plays correctly (this is NOT a bug condition, should be preserved)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- When the audio URL is valid and the network is stable, voiceover audio plays correctly in the Remotion Player preview without interruption
- First-load preview rendering with evaluated component and scene plan works as before
- Backend `audioError: true` when `audioPath` is missing continues to show the "Audio unavailable" indicator
- Regenerate and Download MP4 buttons continue to function without interference from the audio refresh mechanism
- Final rendered/downloaded video continues to include correct voiceover audio (unaffected by preview-only changes)
- Non-preview-eligible stages continue to show `VideoPreviewSection` without any audio refresh logic

**Scope:**
All inputs where the audio URL is valid, fresh (< 3600s old), loads successfully, and TTS was already complete before mount should be completely unaffected by this fix. This includes:

- Normal first-load playback with a fresh signed URL
- Mouse/keyboard interactions with the Remotion Player controls
- All non-audio preview data (code, scenePlan, fps, dimensions)
- Backend use case logic and signed URL generation

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **No URL refresh mechanism in `usePreviewData`**: The hook calls `fetchPreviewData` once when `enabled` becomes true (lines 68-76 of `use-preview-data.ts`). There is no interval, no expiry-aware re-fetch, and no event-driven refresh. Once the signed URL ages past 3600s, it becomes invalid and the hook has no way to know or react.

2. **No audio error handling in `CompositionWrapper`**: The `<Audio src={audioUrl} />` in `remotion-preview-player.tsx` (line 30) has no `onError` callback. When the audio resource fails to load (expired URL, network error), the failure is swallowed by the browser and Remotion continues playback silently without audio.

3. **No client-side audio error state**: The `audioError` field in `PreviewDataResponse` only reflects whether `audioPath` was missing on the backend (line 107-109 of `get-preview-data.use-case.ts`). There is no client-side state to capture runtime audio loading failures, so the UI has no way to show an error or offer retry.

4. **No polling for late TTS completion**: When TTS finishes after the user is already on a preview-eligible stage, the `audioUrl` in the initial fetch response is `null`. The hook never re-fetches, so the newly available audio is invisible until a manual page refresh.

## Correctness Properties

Property 1: Bug Condition — Stale URL Refresh

_For any_ preview playback input where the signed audio URL has aged past the refresh threshold, the fixed `usePreviewData` hook SHALL trigger a re-fetch of preview data before the URL expires, ensuring the `audioUrl` in state is always backed by a valid signed URL.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Audio Load Error Recovery

_For any_ preview playback input where the `<Audio>` component fails to load the audio resource, the fixed `CompositionWrapper` SHALL detect the error via an `onError` handler, propagate a client-side audio error state, and trigger a re-fetch to obtain a fresh URL.

**Validates: Requirements 2.3, 2.5**

Property 3: Bug Condition — Late TTS Pickup

_For any_ preview playback input where `audioUrl` is `null` and TTS has not yet completed, the fixed `usePreviewData` hook SHALL periodically re-fetch preview data until a non-null `audioUrl` is obtained or a maximum retry count is reached.

**Validates: Requirements 2.4**

Property 4: Preservation — Valid Audio Playback Unchanged

_For any_ preview playback input where the audio URL is valid, fresh (under the refresh threshold), and loads successfully, the fixed code SHALL produce the same playback behavior as the original code, preserving uninterrupted voiceover audio.

**Validates: Requirements 3.1, 3.2**

Property 5: Preservation — Non-Audio Functionality Unchanged

_For any_ user interaction that does not involve audio URL validity (Regenerate, Download, non-preview stages, backend audioError flag), the fixed code SHALL produce exactly the same behavior as the original code.

**Validates: Requirements 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/web/src/features/pipeline/hooks/use-preview-data.ts`

**Changes**:

1. **Add periodic re-fetch interval**: Introduce a `setInterval` that calls `fetchPreviewData` every ~30 minutes (well before the 3600s expiry) while the hook is enabled. Clear the interval on unmount or when `enabled` becomes false.
2. **Add audio-error-triggered re-fetch**: Expose a `refreshAudioUrl` callback that components can call when an audio load error is detected. This callback calls `fetchPreviewData` with a debounce/cooldown to avoid rapid re-fetch loops.
3. **Add null-audio polling**: When `previewData` is fetched but `audioUrl` is `null` and `audioError` is `false` (TTS still in progress), start a shorter polling interval (~10 seconds) to re-fetch until `audioUrl` becomes non-null or a max attempt count is reached.
4. **Expose `audioLoadError` state**: Add a `audioLoadError` state field to `UsePreviewDataResult` that is set by the `onAudioError` callback and cleared on successful re-fetch.

**File**: `apps/web/src/features/pipeline/components/remotion-preview-player.tsx`

**Changes**:

1. **Add `onAudioError` prop**: Accept an `onAudioError` callback prop on `RemotionPreviewPlayer` and pass it through to `CompositionWrapper`.
2. **Add error handling to `<Audio>`**: In `CompositionWrapper`, wrap the `<Audio>` component with an `onError` handler that calls the `onAudioError` callback when the audio resource fails to load.

**File**: `apps/web/src/features/pipeline/components/video-preview-page.tsx`

**Changes**:

1. **Wire `onAudioError`**: Pass the `refreshAudioUrl` callback from `usePreviewData` as the `onAudioError` prop to `RemotionPreviewPlayer`.
2. **Display client-side audio error**: When `audioLoadError` is true, show a warning banner below the player (similar to the existing `audioError` indicator) with a "Retry" button that calls `refreshAudioUrl`.
3. **Keep existing `audioError` indicator**: The backend `audioError` flag continues to show "Audio unavailable" as before — the new client-side error is a separate, additional indicator.

### Constants

- `AUDIO_URL_REFRESH_INTERVAL_MS = 30 * 60 * 1000` (30 minutes — half the 3600s expiry)
- `NULL_AUDIO_POLL_INTERVAL_MS = 10_000` (10 seconds for TTS polling)
- `NULL_AUDIO_MAX_POLLS = 30` (5 minutes max polling for TTS)
- `AUDIO_ERROR_REFETCH_COOLDOWN_MS = 5_000` (debounce rapid error-triggered re-fetches)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests against the current `usePreviewData` hook and `CompositionWrapper` to confirm that (a) no re-fetch occurs after initial mount, (b) no audio error is detected or surfaced, and (c) null audioUrl is never re-polled.

**Test Cases**:

1. **Stale URL test**: Render `usePreviewData`, advance fake timers by 3600s, assert no re-fetch was triggered (will confirm bug on unfixed code)
2. **Audio error test**: Render `CompositionWrapper` with an invalid audioUrl, fire an `error` event on the audio element, assert no error callback is invoked (will confirm bug on unfixed code)
3. **Late TTS test**: Render `usePreviewData` with a mock that returns `audioUrl: null`, wait, assert no subsequent fetch is made (will confirm bug on unfixed code)
4. **No error state test**: Render `VideoPreviewPage` with a failed audio load, assert no client-side error indicator is shown (will confirm bug on unfixed code)

**Expected Counterexamples**:

- `usePreviewData` never calls `fetchPreviewData` after the initial mount regardless of time elapsed
- `CompositionWrapper` has no `onError` handler on the `<Audio>` element
- No polling occurs when `audioUrl` is null

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := usePreviewData_fixed(input)
  ASSERT result.audioUrl IS valid AND NOT expired
     OR result.audioLoadError = true AND errorIndicatorShown
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT usePreviewData_original(input) = usePreviewData_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many combinations of valid audioUrl, fresh urlAge, and successful loads
- It catches edge cases around the refresh threshold boundary
- It provides strong guarantees that non-buggy playback is unchanged

**Test Plan**: Observe behavior on UNFIXED code first for valid-URL playback and non-audio interactions, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Valid URL preservation**: Verify that when audioUrl is valid and fresh, the hook returns the same previewData without triggering unnecessary re-fetches
2. **First-load rendering preservation**: Verify that evaluatedComponent and scenePlan are returned identically on first successful fetch
3. **Regenerate/Download preservation**: Verify that button click handlers are not affected by the presence of the refresh interval
4. **Non-preview stage preservation**: Verify that when stage is not preview-eligible, no fetch or interval is started

### Unit Tests

- `usePreviewData`: Test periodic re-fetch fires at the correct interval using fake timers
- `usePreviewData`: Test null-audio polling starts when audioUrl is null and audioError is false
- `usePreviewData`: Test null-audio polling stops after max attempts
- `usePreviewData`: Test `refreshAudioUrl` callback triggers a re-fetch with cooldown
- `usePreviewData`: Test `audioLoadError` state is set on error and cleared on successful re-fetch
- `CompositionWrapper`: Test `onError` handler is called when `<Audio>` fires an error event
- `CompositionWrapper`: Test `<Audio>` renders normally when audioUrl is valid
- `VideoPreviewPage`: Test client-side audio error banner appears when `audioLoadError` is true
- `VideoPreviewPage`: Test retry button in error banner calls `refreshAudioUrl`

### Property-Based Tests

- Generate random `urlAgeSeconds` values (0–7200) and verify: if >= refresh threshold, a re-fetch is scheduled; if < threshold, no unnecessary re-fetch occurs
- Generate random `audioUrl` (null | valid string) × `audioError` (true | false) combinations and verify null-audio polling behavior matches specification
- Generate random sequences of successful/failed audio loads and verify error state transitions are correct (set on error, cleared on success)

### Integration Tests

- Full preview flow: mount `VideoPreviewPage` with mock repository, advance timers past refresh interval, verify re-fetch occurs and new audioUrl is used
- Late TTS flow: mount with audioUrl null, mock repository returns audioUrl on second call, verify audio becomes available without page refresh
- Error recovery flow: mount with valid audioUrl, simulate audio load error, verify error banner appears, click retry, verify re-fetch and error banner clears
- Preservation flow: mount with valid fresh audioUrl, play preview, verify no re-fetches occur within the refresh interval
