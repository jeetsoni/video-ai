# Implementation Plan: Voice Selector with Audio Preview

## Overview

Add a voice selector with audio preview to the Pipeline Wizard (Draft Hero). Implementation follows the existing Clean Architecture layers: shared types/registry in `@video-ai/shared`, domain entity and use case updates in `apps/api`, a new `GET /api/pipeline/voices` endpoint, Prisma migration for `voiceId`, TTS worker per-job voice selection, and a `VoiceSelector` component with `useVoicePreview` hook in `apps/web`. Each task builds incrementally on the previous, wiring everything together at the end.

## Tasks

- [x] 1. Add voice registry and shared types to `@video-ai/shared`
  - [x] 1.1 Create voice registry constant and types
    - Create `packages/shared/src/voices/voice-registry.ts`
    - Define `FeaturedVoice` interface with `voiceId`, `name`, `category`, `gender`, `description`
    - Define `FEATURED_VOICES` constant array with the 5 curated voices (Natasha, Aaron, Josh, Adam, Bella) in the specified order
    - Export `FEATURED_VOICE_IDS` Set and `DEFAULT_VOICE_ID` (`uxKr2vlA4hYgXZR1oPRT`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Create voice API types
    - Create `packages/shared/src/types/voice.types.ts`
    - Define `VoiceEntry` interface with `voiceId`, `name`, `description`, `previewUrl`, `gender`, `featured`, `category`
    - Define `ListVoicesResponse` interface with `voices: VoiceEntry[]`
    - _Requirements: 2.2_

  - [x] 1.3 Update `createPipelineJobSchema` with optional `voiceId`
    - Modify `packages/shared/src/schemas/pipeline.schema.ts`
    - Add `voiceId: z.string().min(1).optional()` to `createPipelineJobSchema`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.4 Update `PipelineJobDto` with optional `voiceId`
    - Add `voiceId?: string` field to `PipelineJobDto` in `packages/shared/src/types/pipeline.types.ts`
    - _Requirements: 9.1_

  - [x] 1.5 Update shared package barrel exports
    - Add voice registry exports (`FeaturedVoice`, `FEATURED_VOICES`, `FEATURED_VOICE_IDS`, `DEFAULT_VOICE_ID`) to `packages/shared/src/index.ts`
    - Add voice type exports (`VoiceEntry`, `ListVoicesResponse`) to `packages/shared/src/index.ts`
    - _Requirements: 1.4_

  - [ ]\* 1.6 Write property tests for shared schema validation
    - **Property 6: Schema accepts valid payloads with optional voiceId**
    - Use `fast-check` to generate random valid `topic` (3–500 chars), `format` ("reel" | "short" | "longform"), `themeId` (non-empty string), and optional `voiceId` (non-empty string or omitted)
    - Verify `createPipelineJobSchema.safeParse()` succeeds for all generated inputs
    - **Validates: Requirements 5.1, 5.2**

  - [ ]\* 1.7 Write property test for schema rejecting empty voiceId
    - **Property 7: Schema rejects empty voiceId**
    - Use `fast-check` to generate otherwise-valid payloads with `voiceId` set to `""`
    - Verify `createPipelineJobSchema.safeParse()` fails for all generated inputs
    - **Validates: Requirements 5.3**

- [x] 2. Checkpoint — Verify shared package builds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Update backend domain and persistence for `voiceId`
  - [x] 3.1 Add Prisma migration for `voiceId` column
    - Add `voiceId String?` to `PipelineJob` model in `apps/api/prisma/schema.prisma`
    - Run `npx prisma migrate dev --name add-voice-id-to-pipeline-job` to create migration
    - Existing records get `null` (backward-compatible)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.2 Update `PipelineJob` domain entity with `voiceId`
    - Add `voiceId: string | null` to `PipelineJobProps` interface in `apps/api/src/pipeline/domain/entities/pipeline-job.ts`
    - Add `voiceId` getter
    - Update `create()` factory to accept optional `voiceId` parameter, defaulting to `null`
    - Update `reconstitute()` to accept `voiceId`
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]\* 3.3 Write property test for PipelineJob voiceId round-trip
    - **Property 8: PipelineJob voiceId round-trip**
    - Use `fast-check` to generate random `voiceId` values (non-empty strings or null)
    - Create a `PipelineJob` with each generated `voiceId`, verify the `voiceId` getter returns the same value
    - **Validates: Requirements 7.2, 7.4**

  - [x] 3.4 Update `PipelineJobMapper` for `voiceId`
    - Update `toDomain()` in `apps/api/src/pipeline/infrastructure/mappers/pipeline-job.mapper.ts` to read `record.voiceId` and pass it to `reconstitute()`
    - Update `toPersistence()` to write `job.voiceId`
    - _Requirements: 6.1, 7.2_

  - [x] 3.5 Update `CreatePipelineJobUseCase` to pass `voiceId`
    - Modify `apps/api/src/pipeline/application/use-cases/create-pipeline-job.use-case.ts`
    - Add `voiceId` to `CreatePipelineJobRequest` interface (optional)
    - Pass `voiceId` from parsed data to `PipelineJob.create()`
    - _Requirements: 7.2, 7.3_

  - [x] 3.6 Update `GetJobStatusUseCase` DTO mapping to include `voiceId`
    - Modify `mapToDto()` in `apps/api/src/pipeline/application/use-cases/get-job-status.use-case.ts`
    - Include `voiceId` in the DTO when the entity's `voiceId` is non-null
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]\* 3.7 Write property test for DTO mapping preserving voiceId
    - **Property 10: DTO mapping preserves voiceId**
    - Use `fast-check` to generate `PipelineJob` entities with random `voiceId` values (string or null)
    - Map to DTO and verify: when non-null, DTO `voiceId` equals entity `voiceId`; when null, DTO `voiceId` is undefined
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 4. Checkpoint — Verify domain and persistence changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement voice listing backend (service, use case, endpoint)
  - [x] 5.1 Create `VoiceService` interface
    - Create `apps/api/src/pipeline/application/interfaces/voice-service.ts`
    - Define `VoiceService` interface with `listVoices(): Promise<Result<VoiceEntry[], Error>>`
    - _Requirements: 2.1_

  - [x] 5.2 Implement `ElevenLabsVoiceService`
    - Create `apps/api/src/pipeline/infrastructure/services/elevenlabs-voice-service.ts`
    - Inject `ElevenLabsClient` (reuse existing SDK dependency)
    - Implement `listVoices()`: call `client.voices.getAll()`, map each voice to `VoiceEntry`, set `featured: true` for voices in `FEATURED_VOICE_IDS`, sort featured first (in registry order) then non-featured alphabetically
    - On SDK failure, return the 3 `FEATURED_VOICES` as fallback with `previewUrl: null`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]\* 5.3 Write property test for voice mapping required fields
    - **Property 1: Voice mapping produces required fields**
    - Use `fast-check` to generate random ElevenLabs voice-like objects with random `voice_id`, `name`, optional `preview_url`, `labels`
    - Map each to `VoiceEntry` and verify non-empty `voiceId`, non-empty `name`, `description` string, and `previewUrl` (string or null)
    - **Validates: Requirements 2.2**

  - [ ]\* 5.4 Write property test for featured flag correctness
    - **Property 2: Featured flag correctness**
    - Use `fast-check` to generate voice lists with random IDs, some matching `FEATURED_VOICE_IDS`
    - After merging, verify `featured === true` if and only if `voiceId` is in `FEATURED_VOICE_IDS`
    - **Validates: Requirements 2.3**

  - [ ]\* 5.5 Write property test for featured-first sort invariant
    - **Property 3: Featured-first sort invariant**
    - Use `fast-check` to generate mixed featured/non-featured voice lists
    - After sorting, verify no index `i < j` where `voices[i].featured === false` and `voices[j].featured === true`
    - **Validates: Requirements 2.4**

  - [x] 5.6 Create `ListVoicesUseCase`
    - Create `apps/api/src/pipeline/application/use-cases/list-voices.use-case.ts`
    - Implement `UseCase<void, Result<ListVoicesResponse, Error>>` that delegates to `VoiceService.listVoices()`
    - _Requirements: 2.1_

  - [x] 5.7 Add `listVoices` method to `PipelineController`
    - Add `listVoicesUseCase` to `PipelineController` constructor
    - Implement `listVoices()` method following existing controller patterns (try/catch, Result handling)
    - _Requirements: 2.1_

  - [x] 5.8 Add `GET /voices` route to pipeline routes
    - Add `router.get("/voices", ...)` to `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts`
    - Wire to `controller.listVoices()`
    - _Requirements: 2.1_

  - [x] 5.9 Update pipeline factory to wire voice service and use case
    - Modify `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`
    - Instantiate `ElevenLabsVoiceService` with the ElevenLabs API key from environment
    - Instantiate `ListVoicesUseCase` with the voice service
    - Pass `listVoicesUseCase` to `PipelineController`
    - _Requirements: 2.1_

- [x] 6. Update TTS worker for per-job voice selection
  - [x] 6.1 Modify `TTSGenerationWorker` to use per-job `voiceId`
    - Modify `apps/api/src/pipeline/infrastructure/queue/workers/tts-generation.worker.ts`
    - Read `voiceId` from `pipelineJob.voiceId`
    - Use `pipelineJob.voiceId ?? this.voiceId` as the voice for `generateSpeech()`
    - The constructor `voiceId` becomes the fallback default
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]\* 6.2 Write property test for TTS worker per-job voiceId
    - **Property 9: TTS worker uses per-job voiceId**
    - Use `fast-check` to generate random non-empty `voiceId` strings
    - Mock `PipelineJob` with the generated `voiceId`, mock `ttsService.generateSpeech()`
    - Verify `generateSpeech()` is called with the job's `voiceId`, not the constructor default
    - **Validates: Requirements 8.2**

- [x] 7. Checkpoint — Verify backend changes end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement frontend voice selector and preview
  - [x] 8.1 Add `listVoices` to frontend pipeline repository
    - Add `listVoices(): Promise<ListVoicesResponse>` to `PipelineRepository` interface in `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`
    - Implement in `HttpPipelineRepository` in `apps/web/src/features/pipeline/repositories/http-pipeline.repository.ts` calling `GET ${BASE}/voices`
    - Add `ListVoicesResponse` import from `@video-ai/shared`
    - _Requirements: 2.1_

  - [x] 8.2 Create `useVoicePreview` hook
    - Create `apps/web/src/features/pipeline/hooks/use-voice-preview.ts`
    - Manage a single `HTMLAudioElement` instance
    - Expose `play(voiceId, previewUrl)`, `stop()`, `playingVoiceId` state
    - Handle `ended` and `error` events to reset state
    - Track `errorVoiceId` for inline error indicator
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 8.3 Create `VoiceSelector` component
    - Create `apps/web/src/features/pipeline/components/voice-selector.tsx`
    - Accept `voices: VoiceEntry[]`, `selectedVoiceId`, `onSelect`, `isLoading` props
    - Display "Recommended" section with featured voices grouped by category ("Fast & Energetic", "Natural & Human-like")
    - Show each voice with name, description, and play/stop preview button
    - Highlight selected voice with visual indicator (check mark or border)
    - Default to `DEFAULT_VOICE_ID` (Natasha) as pre-selected
    - Hide preview button when `previewUrl` is null
    - Show inline error indicator on playback failure
    - Support keyboard navigation and ARIA labels (`role`, `aria-selected`, `aria-label`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]\* 8.4 Write property test for voice entry rendering
    - **Property 4: Voice entry renders name and description**
    - Use `fast-check` to generate random `VoiceEntry` objects with non-empty `name` and `description`
    - Render in `VoiceSelector` and verify output contains both the voice name and description text
    - **Validates: Requirements 3.2**

  - [ ]\* 8.5 Write property test for preview button hidden when previewUrl is null
    - **Property 5: Preview button hidden for null previewUrl**
    - Use `fast-check` to generate random `VoiceEntry` objects with `previewUrl: null`
    - Render in `VoiceSelector` and verify no play/preview button element is present for that voice
    - **Validates: Requirements 4.4**

  - [x] 8.6 Update `CreateJobParams` to include optional `voiceId`
    - Add `voiceId?: string` to `CreateJobParams` in `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`
    - _Requirements: 7.1_

  - [x] 8.7 Update `DraftHero` component with voice selection
    - Modify `apps/web/src/features/pipeline/components/draft-hero.tsx`
    - Add `voiceId` state (default `DEFAULT_VOICE_ID`)
    - Fetch voices from `pipelineRepository.listVoices()` on mount
    - Render `VoiceSelector` between the theme picker and submit button
    - Include `voiceId` in the `createJob` payload
    - _Requirements: 3.1, 3.4, 7.1_

  - [x] 8.8 Update `PipelineWizard` component with voice selection
    - Modify `apps/web/src/features/pipeline/components/pipeline-wizard.tsx`
    - Add `voiceId` state (default `DEFAULT_VOICE_ID`)
    - Accept voices data and render `VoiceSelector`
    - Include `voiceId` in the `onSubmit` data
    - _Requirements: 3.1, 3.4, 7.1_

- [x] 9. Final checkpoint — Verify all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — no language selection needed
- Aaron and Bella voice IDs need to be resolved from the ElevenLabs API at development time and hardcoded in the voice registry
