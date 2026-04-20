# SSE Reconnect Scene Progress Bugfix Design

## Overview

When a user refreshes the page during the `code_generation` stage, per-scene progress (which scenes are generating, completed, or failed — plus their generated code) is lost because scene progress events are published exclusively via Redis pub/sub. The fix adds buffering of scene progress events to a Redis list (using the existing `RedisStreamEventPublisher.buffer()` infrastructure) and replays them from the `ProgressController` when a client reconnects during `code_generation`.

The approach mirrors the existing script-streaming buffer/replay pattern (`ScriptGenerationWorker` → `StreamController`) but applies it to the progress SSE channel for scene progress events.

## Glossary

- **Bug_Condition (C)**: The client reconnects (page refresh) to the progress SSE endpoint while the job is in `code_generation` stage and scene progress events have been published
- **Property (P)**: On reconnect, all previously buffered scene progress events are replayed to the client before live pub/sub subscription begins, restoring full scene-level detail
- **Preservation**: Existing real-time pub/sub delivery, terminal status handling, non-`code_generation` stage behavior, and script streaming buffer/replay must remain unchanged
- **`publishSceneProgress()`**: Method in `CodeGenerationWorker` that publishes per-scene progress events (generating/completed/failed) — currently only uses `publish()`, not `buffer()`
- **`streamProgress()`**: Method in `ProgressController` that sends initial job state from DB and subscribes to Redis pub/sub — currently has no buffer replay logic
- **`stream:progress:{jobId}`**: Redis pub/sub channel for progress events
- **`stream:buffer:scene-progress:{jobId}`**: New Redis list key for buffered scene progress events

## Bug Details

### Bug Condition

The bug manifests when a user refreshes the page during `code_generation` while scenes are being generated in parallel. The `CodeGenerationWorker.publishSceneProgress()` only calls `eventPublisher.publish()` (ephemeral pub/sub), so events published while no subscriber is listening are permanently lost. When the `ProgressController.streamProgress()` handles the reconnection, it only sends the job-level state from the database (stage: "code_generation", status: "processing") and subscribes to pub/sub for future events — it has no mechanism to replay missed scene progress.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { jobId: string, jobStage: string, hasBufferedSceneProgress: boolean, isReconnect: boolean }
  OUTPUT: boolean

  RETURN input.jobStage == "code_generation"
         AND input.isReconnect == true
         AND input.hasBufferedSceneProgress == true
END FUNCTION
```

### Examples

- User refreshes when scenes 1 and 2 are "completed" (with code) and scene 3 is "generating" → After reconnect, UI shows generic "code_generation/processing" with 0 scene detail instead of the 3 scene statuses
- User refreshes immediately after scene 1 completes → The completed scene code is lost, progressive preview disappears
- User's network drops briefly during code generation → Same loss of scene progress on reconnect
- User refreshes when all scenes are completed but job hasn't transitioned to "preview" yet → All scene codes lost, no progressive preview

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Real-time scene progress delivery via pub/sub for continuously connected clients must work exactly as before
- Terminal status (completed/failed) must continue to close the SSE connection and end the stream
- Non-`code_generation` stages (script_generation, rendering, done, etc.) must not attempt scene progress replay
- Script streaming's independent buffer/replay mechanism (`stream:buffer:script:{jobId}`) must not be affected
- The `publishProgressEvent()` method (job-level progress) must continue using pub/sub only — only scene progress events need buffering

**Scope:**
All inputs that do NOT involve reconnecting during `code_generation` with existing buffered scene progress should be completely unaffected by this fix. This includes:

- First-time SSE connections (no replay needed, just subscribe to pub/sub)
- Connections for jobs in any stage other than `code_generation`
- Job-level progress events (stage transitions, failure events)
- Mouse/keyboard interactions on the frontend

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is a two-part omission:

1. **Missing Buffer Writes in `CodeGenerationWorker.publishSceneProgress()`**: The method only calls `this.eventPublisher.publish()` for scene progress events. Unlike `ScriptGenerationWorker` which calls both `publish()` and `buffer()` for every script event, scene progress events are never persisted to a Redis list. This means there is no durable record of scene progress to replay.

2. **Missing Buffer Replay in `ProgressController.streamProgress()`**: The controller sends the initial job-level state from the database and subscribes to pub/sub, but has no logic to check for or replay buffered scene progress events. Unlike `StreamController.streamScriptGeneration()` which replays buffered script events before subscribing to live pub/sub, the progress controller has no equivalent replay step.

3. **Missing `markComplete()` Call**: When all scenes finish and the job transitions out of `code_generation`, there is no call to `markComplete()` on the scene progress buffer, so no TTL is set for cleanup.

## Correctness Properties

Property 1: Bug Condition - Scene Progress Events Are Buffered and Replayed on Reconnect

_For any_ SSE reconnection where the job is in `code_generation` stage and scene progress events have been buffered, the `ProgressController` SHALL replay all buffered scene progress events to the client before subscribing to live pub/sub, so the client receives the complete history of scene progress followed by any new real-time updates.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-Reconnect and Non-Code-Generation Behavior Unchanged

_For any_ SSE connection where the job is NOT in `code_generation` stage, or where no buffered scene progress events exist, the `ProgressController` SHALL produce the same behavior as the original code — sending job-level state from the database and subscribing to pub/sub without attempting scene progress replay.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`

**Function**: `publishSceneProgress()`

**Specific Changes**:

1. **Add buffer call alongside publish**: After calling `this.eventPublisher.publish()`, also call `this.eventPublisher.buffer()` with key `stream:buffer:scene-progress:{jobId}` to persist each scene progress event to a Redis list
2. **Call `markComplete()` after stage transition**: After the job transitions from `code_generation` to `preview` (at the end of `process()`), call `this.eventPublisher.markComplete()` on the scene progress buffer key with a TTL of 3600 seconds (1 hour), matching the script buffer TTL

---

**File**: `apps/api/src/pipeline/presentation/controllers/progress.controller.ts`

**Function**: `streamProgress()`

**Specific Changes**: 3. **Inject `StreamEventBuffer` dependency**: Add a `StreamEventBuffer` parameter to the constructor so the controller can read buffered events 4. **Add scene progress replay logic**: After sending the initial job-level state and before subscribing to pub/sub, check if the job is in `code_generation` stage. If so, read all buffered events from `stream:buffer:scene-progress:{jobId}` using `buffer.getAll()` and send each one as an SSE event 5. **Maintain event ordering**: Replay buffered events first, then subscribe to live pub/sub, ensuring the client receives historical events before real-time ones

---

**File**: `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`

**Function**: `createPipelineModule()`

**Specific Changes**: 6. **Wire `StreamEventBuffer` into `ProgressController`**: Pass the existing `streamEventBuffer` instance (already created for `StreamController`) to the `ProgressController` constructor

---

**Frontend**: No changes required. The `usePipelineProgress` hook already handles `sceneProgress` events — it updates `sceneProgress` and `completedSceneCodes` state maps for any event containing `event.data.sceneProgress`. Replayed events will be processed identically to live events.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that mock the `StreamEventPublisher` and verify that `CodeGenerationWorker.publishSceneProgress()` does NOT call `buffer()`. Write tests that mock `StreamEventBuffer` and verify that `ProgressController.streamProgress()` does NOT call `getAll()` for scene progress. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:

1. **Buffer Not Called Test**: Verify `publishSceneProgress()` calls `publish()` but NOT `buffer()` (will pass on unfixed code, confirming root cause)
2. **No Replay Test**: Verify `streamProgress()` for a `code_generation` job does NOT replay buffered scene progress (will pass on unfixed code, confirming root cause)
3. **Scene Progress Lost on Reconnect Test**: Simulate publishing scene progress events, then create a new subscriber — verify the new subscriber receives no historical events (will pass on unfixed code, confirming the bug)

**Expected Counterexamples**:

- `buffer()` is never called by `publishSceneProgress()` — events are ephemeral
- `ProgressController` has no reference to `StreamEventBuffer` — replay is impossible

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := streamProgress_fixed(input)
  ASSERT allBufferedSceneProgressEventsReplayed(result)
  ASSERT replayedEventsBeforeLiveSubscription(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT streamProgress_original(input) = streamProgress_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (different stages, statuses, empty/non-empty buffers)
- It catches edge cases that manual unit tests might miss (e.g., buffer with 0 events, buffer with only failed scenes)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-`code_generation` jobs and continuously-connected clients, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Non-Code-Generation Stage Preservation**: Verify that for jobs in script_generation, rendering, preview, or done stages, the progress controller behaves identically before and after the fix
2. **Terminal Status Preservation**: Verify that terminal status jobs still close the SSE connection immediately
3. **Live Pub/Sub Delivery Preservation**: Verify that for continuously connected clients during code_generation, scene progress events still arrive in real-time via pub/sub
4. **Script Buffer Independence**: Verify that the script streaming buffer (`stream:buffer:script:{jobId}`) is not read or modified by the progress controller

### Unit Tests

- Test `CodeGenerationWorker.publishSceneProgress()` calls both `publish()` and `buffer()` with correct keys
- Test `CodeGenerationWorker.process()` calls `markComplete()` on the scene progress buffer after transitioning to preview
- Test `ProgressController.streamProgress()` replays buffered scene progress events for `code_generation` jobs
- Test `ProgressController.streamProgress()` does NOT replay for non-`code_generation` jobs
- Test replay ordering: buffered events sent before pub/sub subscription
- Test edge case: empty buffer during `code_generation` (no scene progress yet)
- Test edge case: buffer with only "generating" events (no completed codes)

### Property-Based Tests

- Generate random sets of scene progress events (varying sceneId, status, code presence) and verify all are buffered and replayed correctly on reconnect
- Generate random job stages and verify scene progress replay only occurs during `code_generation`
- Generate random sequences of publish/reconnect/publish and verify no events are lost

### Integration Tests

- Test full reconnect flow: start code generation → publish scene progress → simulate disconnect → reconnect → verify all scene progress replayed
- Test that replayed events followed by live events produce correct cumulative state
- Test TTL expiry: verify buffer is cleaned up after `markComplete()` TTL
