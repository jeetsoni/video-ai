# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — Scene Progress Events Lost on Reconnect During Code Generation
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate scene progress events are not buffered and not replayed on reconnect
  - **Scoped PBT Approach**: Scope the property to `code_generation` stage jobs where scene progress events have been published and a reconnect occurs
  - Test `CodeGenerationWorker.publishSceneProgress()`: verify it calls `eventPublisher.buffer()` with key `stream:buffer:scene-progress:{jobId}` for each scene progress event — on unfixed code, `buffer()` is never called (confirms root cause part 1)
  - Test `ProgressController.streamProgress()`: for a `code_generation` job with buffered scene progress, verify it calls `buffer.getAll()` on `stream:buffer:scene-progress:{jobId}` and sends each buffered event via SSE before subscribing to pub/sub — on unfixed code, the controller has no `StreamEventBuffer` dependency and no replay logic (confirms root cause part 2)
  - Use property-based generation of scene progress events (varying sceneId, sceneName, status: generating/completed/failed, optional code) to verify all are buffered and replayed
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found: `buffer()` never called by `publishSceneProgress()`, `ProgressController` has no `StreamEventBuffer` reference
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Non-Code-Generation and Continuous-Connection Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 — Observe on unfixed code**:
    - Observe: `ProgressController.streamProgress()` for a `script_generation` job sends job-level state from DB and subscribes to pub/sub without any scene progress replay
    - Observe: `ProgressController.streamProgress()` for a terminal-status job (completed/failed) sends job-level state and immediately ends the response
    - Observe: `ProgressController.streamProgress()` for a `rendering` job sends job-level state and subscribes to pub/sub without scene progress replay
    - Observe: `publishProgressEvent()` (job-level events) only calls `publish()`, not `buffer()`
  - **Step 2 — Write property-based tests capturing observed behavior**:
    - Property: for all job stages NOT equal to `code_generation` (generate from: script_generation, script_review, rendering, preview, done), `streamProgress()` sends exactly one initial SSE event with job-level data and subscribes to pub/sub — no scene progress replay attempted
    - Property: for all terminal-status jobs (completed, failed), `streamProgress()` sends one SSE event and calls `res.end()` — no pub/sub subscription
    - Property: `publishProgressEvent()` calls `eventPublisher.publish()` only — never calls `buffer()` — for all stage/status combinations
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for scene progress events lost on SSE reconnect during code_generation
  - [x] 3.1 Add buffer call to `CodeGenerationWorker.publishSceneProgress()`
    - After the existing `this.eventPublisher.publish()` call, add `this.eventPublisher.buffer()` with key `stream:buffer:scene-progress:{jobId}` and the same event object
    - This persists each scene progress event to a Redis list so it survives subscriber disconnections
    - _Bug_Condition: isBugCondition(input) where input.jobStage == "code_generation" AND input.isReconnect == true AND input.hasBufferedSceneProgress == true_
    - _Expected_Behavior: every scene progress event is durably stored in Redis list `stream:buffer:scene-progress:{jobId}` in addition to being published via pub/sub_
    - _Preservation: `publishProgressEvent()` (job-level events) must NOT call `buffer()` — only scene progress events are buffered_
    - _Requirements: 2.3_

  - [x] 3.2 Add `markComplete()` call to `CodeGenerationWorker.process()`
    - After the successful `transitionTo("preview")` call and before the final `publishProgressEvent()`, call `this.eventPublisher.markComplete()` on `stream:buffer:scene-progress:{jobId}` with TTL of 3600 seconds
    - This sets the completion flag and TTL for cleanup, matching the script buffer pattern
    - _Requirements: 3.5_

  - [x] 3.3 Inject `StreamEventBuffer` into `ProgressController`
    - Add a `buffer: StreamEventBuffer` parameter to the `ProgressController` constructor
    - Store it as a private readonly field
    - _Requirements: 2.2_

  - [x] 3.4 Add scene progress replay logic to `ProgressController.streamProgress()`
    - After sending the initial job-level SSE event and before subscribing to pub/sub, check if `job.stage.value === "code_generation"`
    - If so, read all buffered events from `stream:buffer:scene-progress:{jobId}` using `this.buffer.getAll()`
    - Send each buffered event as an SSE event using `this.sseHelper.sendEvent()`
    - Then proceed to subscribe to live pub/sub as before
    - This mirrors the replay pattern in `StreamController.streamScriptGeneration()`
    - _Bug_Condition: isBugCondition(input) where input.jobStage == "code_generation" AND input.isReconnect == true AND input.hasBufferedSceneProgress == true_
    - _Expected_Behavior: all buffered scene progress events are replayed to the client before live pub/sub subscription begins_
    - _Preservation: non-code_generation stages skip replay entirely; empty buffers during code_generation are handled gracefully (no events sent)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Wire `StreamEventBuffer` into `ProgressController` in `pipeline.factory.ts`
    - In `createPipelineModule()`, pass the existing `streamEventBuffer` instance (already created for `StreamController`) as the fourth argument to the `ProgressController` constructor
    - _Requirements: 2.2_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Scene Progress Events Buffered and Replayed on Reconnect
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: `buffer()` is called for each scene progress event, and `streamProgress()` replays buffered events during `code_generation`
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** — Non-Code-Generation and Continuous-Connection Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions introduced)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite to confirm no regressions
  - Verify bug condition exploration test passes (Property 1)
  - Verify preservation property tests pass (Property 2)
  - Ensure all tests pass, ask the user if questions arise
