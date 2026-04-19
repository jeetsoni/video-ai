# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Voiceover Audio Silent Failure on Stale/Missing URL
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists across all three bug condition branches
  - **Scoped PBT Approach**: Scope the property to the three concrete failing scenarios:
    1. Stale URL (urlAgeSeconds >= 3600): Render `usePreviewData` with a mock repository, advance fake timers by 3600s+, assert a re-fetch was triggered (will FAIL on unfixed code — no re-fetch mechanism exists)
    2. Audio load error: Render `CompositionWrapper` with an audioUrl, fire an `error` event on the `<Audio>` element, assert an `onAudioError` callback is invoked (will FAIL on unfixed code — no onError handler exists)
    3. Late TTS (audioUrl is null, TTS not yet complete): Render `usePreviewData` with mock returning `audioUrl: null` and `audioError: false`, advance timers by 10s intervals, assert subsequent fetches are made to poll for the audio URL (will FAIL on unfixed code — no null-audio polling exists)
  - Bug condition from design: `isBugCondition(input) = stageIsPreviewEligible AND ((audioUrl != null AND urlAgeSeconds >= 3600) OR (audioUrl != null AND NOT audioResourceLoads) OR (ttsCompletedAfterMount AND audioUrl == null))`
  - Expected behavior assertions: re-fetch triggers for stale URLs, onAudioError callback fires on load failure, null-audio polling starts when audioUrl is null
  - Create test file at `apps/web/src/features/pipeline/hooks/use-preview-data.test.ts` for hook tests and `apps/web/src/features/pipeline/components/remotion-preview-player.test.tsx` for audio error tests
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bug exists)
  - Document counterexamples found: `usePreviewData` never re-fetches after mount, `CompositionWrapper` has no `onError` on `<Audio>`, no polling when `audioUrl` is null
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Valid Audio Playback and Non-Audio Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 — Observe** behavior on UNFIXED code for non-buggy inputs (cases where `isBugCondition` returns false):
    - Observe: `usePreviewData` with a valid, fresh audioUrl returns previewData with correct audioUrl, evaluatedComponent, and scenePlan on first fetch
    - Observe: `usePreviewData` with stage not in `["preview", "rendering", "done"]` does NOT trigger any fetch
    - Observe: `RemotionPreviewPlayer` renders `<Audio src={audioUrl}>` when audioUrl is valid
    - Observe: `VideoPreviewPage` Regenerate button calls `repository.regenerateCode(job.id)` without interference
    - Observe: `VideoPreviewPage` shows "Audio unavailable" indicator when `previewData.audioError` is true (backend flag)
  - **Step 2 — Write property-based tests** capturing observed behavior patterns:
    - Property: For all valid audioUrl strings (non-null, fresh), `usePreviewData` returns the same previewData from the initial fetch without triggering additional fetches within the first 30 minutes
    - Property: For all non-preview-eligible stages (`"script"`, `"direction"`, `"code"`, `"voiceover"`), `usePreviewData` does not call `repository.getPreviewData`
    - Property: For all valid audioUrl values, `CompositionWrapper` renders an `<Audio>` element with the correct `src` attribute
    - Property: Backend `audioError: true` continues to show the "Audio unavailable" indicator regardless of any new client-side state
  - Add preservation tests to `apps/web/src/features/pipeline/hooks/use-preview-data.test.ts` and `apps/web/src/features/pipeline/components/video-preview-page.test.tsx`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 3. Fix for voiceover audio silent failure in preview playback
  - [x] 3.1 Add periodic re-fetch and null-audio polling to `usePreviewData` hook
    - Add constants: `AUDIO_URL_REFRESH_INTERVAL_MS = 30 * 60 * 1000`, `NULL_AUDIO_POLL_INTERVAL_MS = 10_000`, `NULL_AUDIO_MAX_POLLS = 30`, `AUDIO_ERROR_REFETCH_COOLDOWN_MS = 5_000`
    - Add a `setInterval` that calls `fetchPreviewData` every 30 minutes while `enabled` is true; clear on unmount or when `enabled` becomes false
    - Add null-audio polling: when `previewData` is fetched but `audioUrl` is `null` and `audioError` is `false`, start a 10s polling interval to re-fetch until `audioUrl` becomes non-null or `NULL_AUDIO_MAX_POLLS` is reached
    - Add `audioLoadError` state (boolean) to the hook, set to `true` by the `onAudioError` callback, cleared on successful re-fetch
    - Expose `refreshAudioUrl` callback with a 5s cooldown that calls `fetchPreviewData` and clears `audioLoadError` on success
    - Update `UsePreviewDataResult` interface to include `audioLoadError: boolean` and `refreshAudioUrl: () => void`
    - _Bug_Condition: isBugCondition(input) where (audioUrl != null AND urlAgeSeconds >= 3600) OR (ttsCompletedAfterMount AND audioUrl == null) OR (audioUrl != null AND NOT audioResourceLoads)_
    - _Expected_Behavior: re-fetch triggers before URL expiry; null-audio polling picks up late TTS; audioLoadError state surfaces client-side failures_
    - _Preservation: valid-URL playback unchanged, first-load rendering unchanged, non-preview stages unaffected_
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.6_

  - [x] 3.2 Add `onAudioError` prop and error handler to `RemotionPreviewPlayer`
    - Add `onAudioError?: () => void` prop to `RemotionPreviewPlayerProps` interface
    - Pass `onAudioError` through to `CompositionWrapper` via `CompositionProps`
    - Add `onError` handler on the `<Audio>` element in `CompositionWrapper` that calls `onAudioError` when the audio resource fails to load
    - _Bug_Condition: isBugCondition(input) where audioUrl != null AND NOT audioResourceLoads_
    - _Expected_Behavior: onAudioError callback fires when <Audio> element encounters a load error_
    - _Preservation: <Audio> renders normally with valid audioUrl, no change to video/component rendering_
    - _Requirements: 2.3, 3.1_

  - [x] 3.3 Wire error callback and display audio error banner in `VideoPreviewPage`
    - Destructure `audioLoadError` and `refreshAudioUrl` from `usePreviewData` result
    - Pass `refreshAudioUrl` as the `onAudioError` prop to `RemotionPreviewPlayer`
    - Add a client-side audio error banner (distinct from backend `audioError` indicator) when `audioLoadError` is true, with an `AlertTriangle` icon, error message ("Voiceover audio failed to load"), and a "Retry" button that calls `refreshAudioUrl`
    - Keep existing `previewData?.audioError` "Audio unavailable" indicator unchanged
    - _Bug_Condition: isBugCondition(input) where audioUrl fails to load on client_
    - _Expected_Behavior: visible error banner with retry option when audio load fails_
    - _Preservation: backend audioError indicator unchanged, Regenerate/Download buttons unaffected_
    - _Requirements: 2.3, 2.5, 3.3, 3.4_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Voiceover Audio Silent Failure on Stale/Missing URL
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior for all three bug condition branches
    - When this test passes, it confirms: periodic re-fetch fires for stale URLs, onAudioError callback is invoked on audio load failure, null-audio polling picks up late TTS
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Valid Audio Playback and Non-Audio Functionality Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix: valid-URL playback, first-load rendering, backend audioError flag, Regenerate/Download actions, non-preview stages
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite for the pipeline feature: `npm test -- --testPathPattern="features/pipeline"` from `apps/web`
  - Ensure all bug condition exploration tests pass (confirming the fix works)
  - Ensure all preservation property tests pass (confirming no regressions)
  - Ensure no other existing tests are broken by the changes
  - Ask the user if questions arise
