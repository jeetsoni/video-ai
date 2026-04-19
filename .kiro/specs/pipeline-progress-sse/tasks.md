# Implementation Plan: Pipeline Progress SSE

## Overview

Replace the HTTP polling `usePipelineJob` hook with a Server-Sent Events push system for pipeline progress tracking. The implementation proceeds in layers: shared progress event types first, then the backend progress controller and worker publishing, then the frontend hook, and finally the page integration and polling removal. The existing script-streaming SSE remains completely untouched.

## Tasks

- [x] 1. Shared package — progress event types and terminal status helper
  - [x] 1.1 Define progress event types and terminal status utility
    - Create `packages/shared/src/types/pipeline-progress.types.ts` with `ProgressEvent` interface containing `type` ("progress"), `seq` (number), and `data` object with `stage` (PipelineStage), `status` (PipelineStatus), `progressPercent` (number), optional `errorCode` and `errorMessage`
    - Export a `isTerminalStatus(status: PipelineStatus): boolean` function that returns `true` for `"completed"`, `"failed"`, and `"awaiting_script_review"`
    - Export all types and the utility from `packages/shared/src/index.ts`
    - _Requirements: 1.6, 2.2, 3.4, 3.5_

  - [ ]* 1.2 Write property test for terminal status detection consistency
    - **Property 2: Terminal status detection is consistent**
    - For every valid `PipelineStatus` value, assert `isTerminalStatus` returns `true` if and only if the status is `"completed"`, `"failed"`, or `"awaiting_script_review"`
    - **Validates: Requirements 1.6, 3.4**

  - [ ]* 1.3 Write property test for progress event structure invariant
    - **Property 1: Progress event structure invariant**
    - Generate arbitrary valid stage, status, and progressPercent (0–100) combinations; construct a `ProgressEvent`; assert it contains `type === "progress"`, numeric `seq`, and valid `data` fields; when status is `"failed"`, assert `errorCode` and `errorMessage` are non-empty strings
    - **Validates: Requirements 1.4, 2.2, 2.3**

- [x] 2. Backend — ProgressController SSE endpoint
  - [x] 2.1 Create ProgressController
    - Create `apps/api/src/pipeline/presentation/controllers/progress.controller.ts`
    - Implement `streamProgress(req, res)` handler following the same pattern as `StreamController`:
      - Validate job ID is a valid UUID → 400 with `{ error: "INVALID_INPUT" }` if not
      - Look up job in repository → 404 with `{ error: "NOT_FOUND" }` if missing
      - Initialize SSE response headers via `sseHelper.initSSE(res)`
      - Send initial progress event from current DB state (stage, status, progressPercent)
      - If job is already in a terminal status, send the event and close immediately
      - Otherwise, subscribe to `stream:progress:{jobId}` Redis Pub/Sub channel
      - Forward received events to the SSE response
      - On terminal event, send it and close the connection
      - Start heartbeat interval every 15 seconds
      - Clean up subscription and heartbeat on client disconnect (`req.on("close")`)
    - Constructor takes `StreamEventSubscriber`, `SSEResponseHelper`, and `PipelineJobRepository`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 2.2 Write unit tests for ProgressController
    - Test SSE headers are set correctly on valid request
    - Test invalid UUID returns 400 with INVALID_INPUT error code
    - Test missing job returns 404 with NOT_FOUND error code
    - Test initial progress event is sent from DB state
    - Test terminal job sends event and closes without subscribing
    - Test heartbeat is sent at 15-second intervals
    - Test client disconnect triggers cleanup (unsubscribe + clear interval)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8_

  - [ ]* 2.3 Write property test for channel distinctness
    - **Property 5: Progress and script channels are always distinct**
    - For any random UUID string, assert `stream:progress:{id}` never equals `stream:script:{id}`
    - **Validates: Requirements 5.3**

- [x] 3. Backend — Route registration and factory wiring
  - [x] 3.1 Register progress SSE route
    - Add `GET /jobs/:id/progress` route to `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts`
    - Update `createPipelineRouter` to accept a `ProgressController` parameter alongside existing `PipelineController` and `StreamController`
    - Route directly to `progressController.streamProgress(req, res)` (raw Express, no HttpRequest/HttpResponse wrapper)
    - _Requirements: 1.1, 5.3_

  - [x] 3.2 Wire ProgressController in pipeline factory
    - Update `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`
    - Create a new `RedisStreamEventSubscriber` instance for the progress controller (separate from the script streaming subscriber)
    - Instantiate `ProgressController` with the new subscriber, existing `sseResponseHelper`, and `repository`
    - Pass `progressController` to `createPipelineRouter`
    - _Requirements: 1.1, 2.4, 5.3, 5.4_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend — Worker progress event publishing
  - [x] 5.1 Add progress publishing to TTSGenerationWorker
    - Inject `StreamEventPublisher` into `TTSGenerationWorker` constructor
    - After each `transitionTo()` + `save()` call, publish a progress event to `stream:progress:{jobId}` with current stage, status, and progressPercent
    - The TTS worker transitions through multiple stages (tts_generation → transcription → timestamp_mapping), so publish one event per transition
    - On `markFailed()` + `save()`, publish a progress event with status `"failed"` including `errorCode` and `errorMessage`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 Add progress publishing to DirectionGenerationWorker
    - Inject `StreamEventPublisher` into `DirectionGenerationWorker` constructor
    - After `transitionTo()` + `save()`, publish a progress event to `stream:progress:{jobId}`
    - On failure, publish a failed progress event
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.3 Add progress publishing to CodeGenerationWorker
    - Inject `StreamEventPublisher` into `CodeGenerationWorker` constructor
    - After `transitionTo()` + `save()`, publish a progress event to `stream:progress:{jobId}`
    - On failure, publish a failed progress event
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.4 Add progress publishing to VideoRenderingWorker
    - Inject `StreamEventPublisher` into `VideoRenderingWorker` constructor
    - After `transitionTo()` + `save()`, publish a progress event to `stream:progress:{jobId}`
    - On failure, publish a failed progress event
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.5 Add progress publishing to TimestampMappingWorker
    - Inject `StreamEventPublisher` into `TimestampMappingWorker` constructor
    - After `transitionTo()` + `save()`, publish a progress event to `stream:progress:{jobId}`
    - On failure, publish a failed progress event
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.6 Add progress publishing to TranscriptionWorker
    - Inject `StreamEventPublisher` into `TranscriptionWorker` constructor
    - After `transitionTo()` + `save()`, publish a progress event to `stream:progress:{jobId}`
    - On failure, publish a failed progress event
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.7 Add progress publishing to ScriptGenerationWorker
    - The ScriptGenerationWorker already has `StreamEventPublisher` for script streaming events
    - Add a progress event publish to `stream:progress:{jobId}` after the script generation completes and the job transitions to `script_review`
    - On failure, publish a failed progress event to the progress channel
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.8 Update worker registry to pass publisher to all workers
    - Update `apps/api/src/pipeline/infrastructure/queue/worker-registry.ts`
    - Pass the existing `eventPublisher` (RedisStreamEventPublisher) to all worker constructors that now require it
    - _Requirements: 2.4_

  - [ ]* 5.9 Write property test for worker progress event publishing
    - **Property 6: Worker publishes a progress event for every state change**
    - For any valid stage transition (via `transitionTo`) or failure (via `markFailed`), assert the worker publishes exactly one progress event to `stream:progress:{jobId}` whose `data.stage` and `data.status` match the job's post-transition state
    - **Validates: Requirements 2.1, 2.3**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Frontend — usePipelineProgress hook
  - [x] 7.1 Create usePipelineProgress hook
    - Create `apps/web/src/features/pipeline/hooks/use-pipeline-progress.ts`
    - On mount: fetch job via `repository.getJobStatus(jobId)` (same as `usePipelineJob`)
    - If job is not in a terminal status: open SSE connection to `/api/pipeline/jobs/{jobId}/progress` using `SSEClient`
    - On progress event: merge `stage`, `status`, `progressPercent` into the existing job state, preserving all other fields
    - On terminal event: close SSE connection
    - If initial fetch shows terminal status: return job data without opening SSE
    - Expose `{ job, isLoading, error, refetch, reconnect }` matching the return shape consumers expect
    - `refetch()`: single HTTP fetch to refresh job state
    - `reconnect()`: close existing SSE, perform fresh fetch, open new SSE if not terminal
    - On unmount: close SSE connection
    - Use `isTerminalStatus` from shared package for terminal detection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.3_

  - [ ]* 7.2 Write property test for SSE connection conditionality
    - **Property 3: SSE connection is conditional on non-terminal status**
    - For any `PipelineJobDto` with varying statuses, assert the hook opens an SSE connection if and only if the status is not terminal
    - **Validates: Requirements 3.2, 3.5**

  - [ ]* 7.3 Write property test for progress event state merge
    - **Property 4: Progress event state merge preserves non-progress fields**
    - For any existing `PipelineJobDto` and any incoming progress event, assert merging updates `stage`, `status`, `progressPercent` while preserving all other fields unchanged
    - **Validates: Requirements 3.3**

  - [ ]* 7.4 Write unit tests for usePipelineProgress hook
    - Test hook mounts and performs initial fetch
    - Test hook opens SSE when job is not terminal
    - Test hook does not open SSE when job is already terminal
    - Test refetch performs a single HTTP fetch
    - Test reconnect closes existing SSE, refetches, and opens new SSE if not terminal
    - Test SSE error sets error state
    - Test return shape includes job, isLoading, error fields
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 8. Frontend — Job detail page integration and polling removal
  - [x] 8.1 Replace usePipelineJob with usePipelineProgress in job detail page
    - Update `apps/web/src/app/jobs/[id]/page.tsx`
    - Replace `import { usePipelineJob }` with `import { usePipelineProgress }`
    - Replace `usePipelineJob({ repository, jobId })` call with `usePipelineProgress({ repository, jobId, apiBaseUrl })`
    - Replace all `restartPolling()` calls with `reconnect()` (in `handleRegenerateScript`, `handleExport`, and `VideoPreviewPage` `onRefresh` prop)
    - Verify `job`, `isLoading`, `error`, `refetch` destructuring still works (same shape)
    - _Requirements: 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Delete usePipelineJob hook file
    - Delete `apps/web/src/features/pipeline/hooks/use-pipeline-job.ts`
    - Verify no remaining imports reference `use-pipeline-job` anywhere in the codebase
    - _Requirements: 4.1_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties from the design document
- The existing script-streaming SSE (`useStreamingScript`, `StreamController`, `stream:script:{jobId}`) remains completely untouched
- No database schema changes are needed — only transient Redis Pub/Sub messages (no buffer/replay needed for progress events)
- The `ProgressController` follows the same pattern as the existing `StreamController` but is simpler (no buffer replay logic)
