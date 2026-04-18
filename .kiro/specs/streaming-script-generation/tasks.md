# Implementation Plan: Streaming Script Generation

## Overview

Replace the batch script generation flow with real-time streaming via SSE. The implementation proceeds in layers: shared event schemas first, then backend shared SSE infrastructure (publisher, subscriber, buffer, response helper), then the streaming script generator and updated worker, then the SSE endpoint and route wiring, and finally the frontend SSE client, hook, and page integration. The BullMQ worker pipeline contract stays unchanged — SSE is a live relay/observer via Redis Pub/Sub.

## Tasks

- [x] 1. Shared package — script stream event schemas
  - [x] 1.1 Define script stream event Zod schemas and types
    - Create `packages/shared/src/schemas/script-stream-event.schema.ts` with `chunkEventSchema`, `sceneEventSchema`, `doneEventSchema`, `errorEventSchema`, and the discriminated union `scriptStreamEventSchema`
    - Each event schema requires `type`, `seq` (non-negative integer), and a typed `data` field per the design
    - Export `ScriptStreamEvent`, `ChunkEvent`, `SceneEvent`, `DoneEvent`, `ErrorEvent` types
    - Export all schemas and types from `packages/shared/src/index.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 1.2 Write property test for script stream event round-trip serialization
    - **Property 1: Script stream event serialization round-trip**
    - Generate arbitrary valid `ScriptStreamEvent` objects (all 4 variants), serialize to JSON, parse back with `scriptStreamEventSchema`, assert deep equality
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 2. Backend shared — SSE streaming infrastructure
  - [x] 2.1 Create SSE response helper
    - Create `apps/api/src/shared/infrastructure/streaming/sse-response-helper.ts`
    - Implement `initSSE(res)` to set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` headers and flush
    - Implement `sendEvent(res, { type, data, id })` to write SSE-formatted `event:`, `id:`, `data:` fields
    - Implement `sendHeartbeat(res)` to write `:heartbeat\n\n` comment
    - _Requirements: 2.1, 2.3, 2.5_

  - [x] 2.2 Create stream event publisher (Redis Pub/Sub + buffer dual-write)
    - Create `apps/api/src/shared/infrastructure/streaming/stream-event-publisher.ts` implementing `StreamEventPublisher` interface
    - `publish(channel, event)` — `PUBLISH` JSON-serialized event to Redis Pub/Sub channel
    - `buffer(bufferKey, event)` — `RPUSH` JSON-serialized event to Redis list
    - `markComplete(bufferKey, ttlSeconds)` — `SET` completion flag key, `EXPIRE` both buffer list and flag with TTL
    - Accept a Redis client (ioredis) via constructor injection
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

  - [ ]* 2.3 Write property test for event buffer ordering and completeness
    - **Property 2: Event buffer ordering and completeness**
    - Publish N arbitrary events via `StreamEventPublisher`, read back from Redis list, assert same order and count
    - **Validates: Requirements 3.1, 8.3**

  - [x] 2.4 Create stream event buffer reader
    - Create `apps/api/src/shared/infrastructure/streaming/stream-event-buffer.ts` implementing `StreamEventBuffer` interface
    - `getAll(bufferKey)` — `LRANGE 0 -1` on the Redis list, return array of JSON strings
    - `isComplete(bufferKey)` — check existence of completion flag key via `EXISTS`
    - Accept a Redis client via constructor injection
    - _Requirements: 9.1, 9.4_

  - [x] 2.5 Create stream event subscriber (Redis Pub/Sub)
    - Create `apps/api/src/shared/infrastructure/streaming/stream-event-subscriber.ts` implementing `StreamEventSubscriber` interface
    - `subscribe(channel, onMessage)` — create a dedicated Redis subscriber client, `SUBSCRIBE` to channel, invoke callback on each message
    - `unsubscribe(channel)` — `UNSUBSCRIBE` and disconnect the subscriber client
    - _Requirements: 8.1, 8.2, 8.6_

  - [x] 2.6 Create shared streaming interface definitions
    - Create `apps/api/src/shared/infrastructure/streaming/interfaces.ts` with `StreamEventPublisher`, `StreamEventSubscriber`, `StreamEventBuffer`, and `SSEResponseHelper` interface definitions
    - _Requirements: 10.1_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend pipeline — streaming script generator
  - [x] 4.1 Define streaming script generator interface
    - Create `apps/api/src/pipeline/application/interfaces/streaming-script-generator.ts` with `StreamingScriptGenerator` interface
    - Method: `generateStream({ topic, format, onChunk, onScene, onDone, onError })` returning `Promise<Result<ScriptGenerationResult, PipelineError>>`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.2 Implement AI streaming script generator
    - Create `apps/api/src/pipeline/infrastructure/services/ai-streaming-script-generator.ts` implementing `StreamingScriptGenerator`
    - Use `streamObject` from Vercel AI SDK with `fullStream` to get partial object deltas
    - Consume `partialObjectStream` to detect new complete scene array elements → emit `onScene`
    - Accumulate text deltas from the `script` field → emit `onChunk`
    - On stream completion, validate the final object (scene count, types, text coverage) → emit `onDone`
    - On error, emit `onError` with descriptive `PipelineError`
    - Reuse the same system prompt and validation logic from `AIScriptGenerator`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 4.3 Write property test for scene detection from partial object stream
    - **Property 3: Scene detection from partial object stream**
    - For any valid structured script response with N scenes, simulate partial object stream, assert exactly N scene events emitted in order with correct data
    - **Validates: Requirements 3.2**

  - [ ]* 4.4 Write property test for chunk text accumulation
    - **Property 4: Chunk text accumulation**
    - For any sequence of chunk events, concatenating all `data.text` values in seq order equals the complete script from the done event
    - **Validates: Requirements 5.4**

- [x] 5. Backend pipeline — update worker to use streaming generator
  - [x] 5.1 Update ScriptGenerationWorker to use StreamingScriptGenerator
    - Modify `apps/api/src/pipeline/infrastructure/queue/workers/script-generation.worker.ts`
    - Inject `StreamingScriptGenerator` and `StreamEventPublisher` alongside existing dependencies
    - Wire `onChunk` → publish chunk event with incrementing seq to Pub/Sub channel `stream:script:<jobId>` and buffer `stream:buffer:script:<jobId>`
    - Wire `onScene` → publish scene event with incrementing seq
    - Wire `onDone` → publish done event, call `markComplete` on buffer with 1-hour TTL, then persist script + scenes to DB and transition to `script_review` (same as current behavior)
    - Wire `onError` → publish error event, mark job as failed
    - The worker completes regardless of SSE client connections
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_

  - [ ]* 5.2 Write property test for sequence number monotonicity
    - **Property 5: Sequence number monotonicity**
    - For any stream of events emitted by the worker, assert `seq` is strictly monotonically increasing starting from 1
    - **Validates: Requirements 9.2**

  - [x] 5.3 Update worker registry to wire streaming dependencies
    - Modify `apps/api/src/pipeline/infrastructure/queue/worker-registry.ts`
    - Create `AIStreamingScriptGenerator` instance
    - Create `RedisStreamEventPublisher` instance with the Redis connection
    - Pass both to `ScriptGenerationWorker` constructor
    - _Requirements: 3.1, 8.1_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Backend pipeline — SSE stream endpoint
  - [x] 7.1 Create SSE stream endpoint handler
    - Create `apps/api/src/pipeline/presentation/controllers/stream.controller.ts`
    - Implement `streamScriptGeneration(req, res)` handler that:
      - Validates job ID, returns 400/404 JSON for invalid/missing jobs
      - Checks job status: if `script_review` or later with buffer → replay `done` event from buffer → close
      - If `script_review` or later without buffer → fetch from DB → synthesize `done` event → close
      - If `failed` → return `error` event → close
      - If `processing` with buffer → replay all buffered events, then subscribe to Pub/Sub for live events
      - If `processing` without buffer → subscribe to Pub/Sub only
      - Starts heartbeat interval (every 15s)
      - Cleans up Pub/Sub subscription and heartbeat on client disconnect
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.1, 9.2, 9.4, 9.5_

  - [x] 7.2 Register SSE stream route
    - Add `GET /jobs/:id/stream` route to `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts`
    - Route directly to the stream controller handler (bypasses HttpRequest/HttpResponse wrappers since SSE needs raw Express response)
    - _Requirements: 2.1_

  - [x] 7.3 Wire stream controller in pipeline factory
    - Update `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`
    - Create `StreamEventBuffer`, `StreamEventSubscriber`, and `SSEResponseHelper` instances
    - Instantiate `StreamController` with dependencies (buffer, subscriber, SSE helper, job repository)
    - Pass stream controller to the router factory
    - _Requirements: 2.1, 10.1_

  - [x] 7.4 Pass Redis connection to pipeline factory
    - Update `apps/api/src/shared/presentation/http/app.ts` and `server.ts` to pass the Redis connection config to `createPipelineModule` so the SSE infrastructure can create Redis clients
    - _Requirements: 8.1_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend shared — SSE client service
  - [x] 9.1 Create SSE client service
    - Create `apps/web/src/shared/services/sse-client.ts`
    - Implement `SSEClient<T>` class accepting `SSEClientConfig<T>` (url, parseEvent, maxRetries, retryDelayMs)
    - `connect()` returns an `AsyncIterable<T>` using `EventSource` or fetch-based readable stream
    - On `done` or `error` event type → yield event and close connection
    - On unexpected disconnect → retry up to `maxRetries` times with exponential backoff (1s, 2s, 4s)
    - `close()` aborts the connection and releases resources
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 10.2_

  - [ ]* 9.2 Write property test for SSE client event parsing
    - **Property 6: SSE client event parsing**
    - For any valid SSE-framed message containing a JSON-serialized `ScriptStreamEvent`, the parser produces a typed event deeply equal to the original
    - **Validates: Requirements 4.2**

- [x] 10. Frontend pipeline — useStreamingScript hook
  - [x] 10.1 Create useStreamingScript hook
    - Create `apps/web/src/features/pipeline/hooks/use-streaming-script.ts`
    - On mount: fetch job status via `PipelineRepository.getJobStatus(jobId)`
    - If job is `script_review` or later → set `status: "complete"`, load script/scenes from DB response, skip SSE
    - If job is in `script_generation` → set `status: "streaming"`, open SSE via `SSEClient` to `/api/pipeline/jobs/:id/stream`
    - Accumulate `chunk` events into `script` string, add `scene` events to `scenes` array
    - On `done` → set `status: "complete"`, update final script and scenes
    - On `error` or connection failure → set `status: "error"`, expose error message
    - On unmount → call `SSEClient.close()`
    - Expose `{ script, scenes, status, error }` to consumers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 11. Frontend pipeline — Script Review Page streaming integration
  - [x] 11.1 Update job detail page to use useStreamingScript
    - Modify `apps/web/src/app/jobs/[id]/page.tsx`
    - Use `useStreamingScript` when job is in `script_generation` stage instead of polling via `usePipelineJob`
    - Pass accumulated `script` and `scenes` to `ScriptReviewEditor`
    - Pass `isLoading={status === "streaming"}` to disable action buttons during streaming
    - Fall back to existing DB-loaded flow when job is already in `script_review` or later
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

  - [x] 11.2 Add typing indicator for in-progress scene
    - Add a typing/pulsing indicator on the last scene block while `status === "streaming"` to show generation is active
    - _Requirements: 6.1_

  - [x] 11.3 Add error state with retry button
    - When `status === "error"`, display error message and a "Retry" button that calls `regenerateScript` and re-initiates streaming
    - _Requirements: 6.5_

  - [x] 11.4 Ensure real-time word count and duration updates
    - Verify the `InsightsSidebar` in `ScriptReviewEditor` updates word count and duration metrics as `script` prop changes during streaming (already reactive via props — confirm no memoization issues)
    - _Requirements: 6.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties from the design document
- The BullMQ worker contract (process job → persist to DB → transition status) remains unchanged — streaming is an overlay
- No database schema changes are needed — only transient Redis keys with 1-hour TTL
- The SSE infrastructure is placed in `shared/` modules for reuse by future streaming features
