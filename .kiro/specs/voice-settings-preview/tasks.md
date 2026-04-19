# Implementation Plan: Voice Settings Preview

## Overview

Add a real-time voice preview capability to VoiceSettingsControls. The implementation flows bottom-up through Clean Architecture layers: shared schema → infrastructure (rate limiter, TTS preview method) → application (use case) → presentation (controller, routes) → frontend (hook, repository, component update) → wiring (factory, route registration). Each layer checkpoint ensures the system stays functional incrementally.

## Tasks

- [x] 1. Add voice preview schema to the shared package
  - [x] 1.1 Add `voicePreviewSchema` to `packages/shared/src/schemas/pipeline.schema.ts`
    - `voicePreviewSchema`: `z.object({ voiceId: z.string().optional(), voiceSettings: voiceSettingsSchema })`
    - _Requirements: 6.1, 6.3_

  - [x] 1.2 Export `voicePreviewSchema` from `packages/shared/src/index.ts`
    - Add `voicePreviewSchema` to the existing schema exports
    - _Requirements: 6.3_

  - [ ]* 1.3 Write property test for voice preview schema validation correctness
    - **Property 2: Voice preview schema validation correctness**
    - Generate random objects (both valid and invalid VoiceSettings shapes, with and without optional voiceId); verify schema accepts valid inputs and rejects invalid ones
    - **Validates: Requirements 1.3, 6.1, 6.2**

- [x] 2. Checkpoint — Ensure shared package builds and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement InMemoryRateLimiter infrastructure
  - [x] 3.1 Create `apps/api/src/shared/infrastructure/rate-limiter/in-memory-rate-limiter.ts`
    - Implement `InMemoryRateLimiter` class with constructor accepting `maxRequests: number` and `windowMs: number`
    - Implement `isAllowed(key: string): { allowed: boolean; retryAfterMs?: number }` using a sliding window approach with `Map<string, number[]>`
    - Prune expired timestamps on each `isAllowed` call
    - _Requirements: 4.3, 4.4_

  - [ ]* 3.2 Write property test for rate limiter sliding window enforcement
    - **Property 3: Rate limiter sliding window enforcement**
    - Generate random sequences of request timestamps from the same key; verify allows ≤maxRequests in any window, blocks the (maxRequests+1)th, and re-allows once older requests fall outside the window
    - **Validates: Requirements 4.3, 4.4**

- [x] 4. Extend TTSService interface and ElevenLabsTTSService with `generatePreview`
  - [x] 4.1 Add `generatePreview` method to `TTSService` interface in `apps/api/src/pipeline/application/interfaces/tts-service.ts`
    - Signature: `generatePreview(params: { text: string; voiceId: string; voiceSettings: VoiceSettings }): Promise<Result<Buffer, PipelineError>>`
    - _Requirements: 1.1, 1.5_

  - [x] 4.2 Implement `generatePreview` in `ElevenLabsTTSService` at `apps/api/src/pipeline/infrastructure/services/elevenlabs-tts-service.ts`
    - Use `client.textToSpeech.convert()` (not `convertWithTimestamps`) with model `eleven_flash_v2_5`
    - Return raw audio `Buffer` directly — no object store upload, no timestamps
    - Use the default voice ID when `params.voiceId` is empty
    - Map `voiceSettings` fields to the ElevenLabs SDK parameters
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

- [x] 5. Checkpoint — Ensure API builds and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement GenerateVoicePreviewUseCase
  - [x] 6.1 Create `apps/api/src/pipeline/application/use-cases/generate-voice-preview.use-case.ts`
    - Implement `UseCase<{ voiceId?: string; voiceSettings: VoiceSettings }, Result<Buffer, PipelineError>>`
    - Define `SAMPLE_TEXT` constant: `"Here is a preview of how your voice settings will sound in the final video."`
    - Inject `TTSService` via constructor
    - In `execute()`: call `ttsService.generatePreview()` with the sample text, voiceId (defaulting empty string), and voiceSettings
    - _Requirements: 1.1, 1.2_

  - [ ]* 6.2 Write property test for valid voice settings producing a successful preview result
    - **Property 1: Valid voice settings produce a successful preview result**
    - Generate random valid `VoiceSettings` (speed in [0.7, 1.2], stability/similarityBoost/style in [0, 1]) and random non-empty voiceId strings; mock TTS service to return a successful buffer; verify use case returns `Result.ok` with a `Buffer`
    - **Validates: Requirements 1.1**

  - [ ]* 6.3 Write unit tests for GenerateVoicePreviewUseCase
    - Test default voiceId fallback when voiceId is undefined
    - Test TTS failure propagation → error result
    - _Requirements: 1.2, 1.4_

- [x] 7. Implement VoicePreviewController and rate limit middleware
  - [x] 7.1 Create rate limit middleware at `apps/api/src/shared/presentation/middleware/rate-limit.middleware.ts`
    - Export `createRateLimitMiddleware(limiter: InMemoryRateLimiter)` returning Express middleware
    - Extract client IP from `req.ip ?? req.socket.remoteAddress ?? "unknown"`
    - On blocked: respond `429` with `Retry-After` header and JSON body `{ error: "rate_limit_exceeded", message: "Too many preview requests. Try again later.", retryAfter: <seconds> }`
    - On allowed: call `next()`
    - _Requirements: 4.3, 4.4_

  - [x] 7.2 Create `VoicePreviewController` at `apps/api/src/pipeline/presentation/controllers/voice-preview.controller.ts`
    - Inject `GenerateVoicePreviewUseCase` via constructor
    - Implement `handlePreview(req: Request, res: Response)` method (uses raw Express Response for binary data)
    - Validate request body with `voicePreviewSchema`; return `400` with `{ error: "INVALID_INPUT", message: "<first Zod error>" }` on failure
    - On use case success: set `Content-Type: audio/mpeg` and send buffer
    - On use case failure: return `502` with `{ error: "tts_generation_failed", message: "..." }`
    - _Requirements: 1.3, 1.4, 1.6, 6.1, 6.2_

  - [ ]* 7.3 Write unit tests for VoicePreviewController
    - Test Content-Type header set to `audio/mpeg` on success
    - Test 400 response on invalid body
    - Test 502 response on TTS failure
    - _Requirements: 1.3, 1.4, 1.6, 6.2_

- [x] 8. Create voice preview route and wire into pipeline router
  - [x] 8.1 Create `apps/api/src/pipeline/presentation/routes/voice-preview.routes.ts`
    - Export `createVoicePreviewRouter(controller: VoicePreviewController, rateLimitMiddleware: RequestHandler)` returning an Express `Router`
    - Register `POST /voice-preview` with rate limit middleware and controller handler
    - _Requirements: 1.1, 4.3_

  - [x] 8.2 Update `pipeline.factory.ts` to instantiate and wire voice preview components
    - Instantiate `InMemoryRateLimiter` with `maxRequests: 10, windowMs: 60_000`
    - Instantiate `ElevenLabsTTSService` (reuse config from worker-registry pattern with `deps.elevenlabsApiKey` and `deps.objectStore`)
    - Instantiate `GenerateVoicePreviewUseCase` with the TTS service
    - Instantiate `VoicePreviewController` with the use case
    - Create rate limit middleware via `createRateLimitMiddleware`
    - Create voice preview router and mount it on the pipeline router
    - _Requirements: 1.1, 4.3_

- [x] 9. Checkpoint — Ensure full API builds and all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build the `useVoiceSettingsPreview` frontend hook
  - [x] 10.1 Create `apps/web/src/features/pipeline/hooks/use-voice-settings-preview.ts`
    - Export `useVoiceSettingsPreview(pipelineRepository: PipelineRepository)` hook
    - Return `{ isLoading, isPlaying, error, cooldownRemaining, requestPreview, stopPlayback }`
    - Manage fetch lifecycle with `AbortController` for cancellation
    - On successful blob response: create object URL, instantiate `Audio`, auto-play
    - Implement 3-second cooldown timer using `setInterval` counting down `cooldownRemaining`
    - On re-click while playing: stop current audio, revoke object URL, start new request
    - On playback end (`onended`): reset `isPlaying` to false
    - On playback error (`onerror`): set `error` state
    - On unmount: abort fetch, pause audio, revoke object URL via cleanup in `useEffect`
    - _Requirements: 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_

  - [ ]* 10.2 Write unit tests for `useVoiceSettingsPreview` hook
    - Test loading state during fetch
    - Test auto-play on success
    - Test stop+restart on re-click while playing
    - Test playback end resets state
    - Test error display on playback failure
    - Test cleanup on unmount
    - Test cooldown timer countdown
    - _Requirements: 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 4.1, 4.2_

- [x] 11. Extend PipelineRepository with `previewVoice` method
  - [x] 11.1 Add `previewVoice` to `PipelineRepository` interface in `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`
    - Signature: `previewVoice(params: { voiceId?: string; voiceSettings: VoiceSettings }): Promise<Blob>`
    - _Requirements: 2.2_

  - [x] 11.2 Implement `previewVoice` in `HttpPipelineRepository` at `apps/web/src/features/pipeline/repositories/http-pipeline.repository.ts`
    - Use `fetch` directly (not the JSON-based `HttpClient`) since the response is binary audio data
    - POST to `/api/pipeline/voice-preview` with JSON body
    - Return `response.blob()` on success; throw on non-ok status
    - _Requirements: 2.2_

- [x] 12. Update VoiceSettingsControls component with Preview button
  - [x] 12.1 Update `apps/web/src/features/pipeline/components/voice-settings-controls.tsx`
    - Add optional props: `voiceId?: string`, `showPreview?: boolean` (default `true`)
    - Import and use `useVoiceSettingsPreview` hook (get `pipelineRepository` from `useAppDependencies`)
    - Render a Preview button below the sliders with states: idle (speaker icon + "Preview"), loading (spinner + "Generating..."), playing (stop icon + "Stop"), cooldown (disabled + "Wait Xs")
    - Display inline error message below button when `error` is set
    - Pass current `voiceId` and `value` (VoiceSettings) to `requestPreview` on click
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 4.1, 4.2, 5.1, 5.3_

  - [ ]* 12.2 Write unit tests for VoiceSettingsControls preview button
    - Test Preview button renders when `showPreview` is true (default)
    - Test Preview button hidden when `showPreview` is false
    - Test button sends correct voiceId and voiceSettings params
    - _Requirements: 2.1, 2.2, 5.1, 5.2_

- [x] 13. Wire voiceId prop into DraftHero and PipelineWizard
  - [x] 13.1 Update `DraftHero` in `apps/web/src/features/pipeline/components/draft-hero.tsx`
    - Pass `voiceId={voiceId}` prop to `<VoiceSettingsControls>`
    - _Requirements: 5.1, 5.2_

  - [x] 13.2 Update `PipelineWizard` in `apps/web/src/features/pipeline/components/pipeline-wizard.tsx`
    - Pass `voiceId={voiceId}` prop to `<VoiceSettingsControls>`
    - _Requirements: 5.1, 5.2_

- [x] 14. Final checkpoint — Ensure full build passes and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each architectural layer
- Property tests use `fast-check` with the existing test framework (minimum 100 iterations per property)
- The voice preview feature is stateless — no database changes or migrations needed
- The `InMemoryRateLimiter` is sufficient for single-server deployment; can be swapped for Redis-based tracking later
- The `ElevenLabsTTSService` reuses the existing service class, adding only the `generatePreview` method
