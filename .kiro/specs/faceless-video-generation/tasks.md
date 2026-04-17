# Implementation Plan: Faceless Video Generation

## Overview

Build the full faceless video generation pipeline following Clean Architecture. The implementation proceeds bottom-up: shared types/schemas first, then backend domain → infrastructure → application → presentation, followed by frontend setup and feature module, then AI service integrations, and finally wiring everything together.

## Tasks

- [x] 1. Shared package — types, schemas, and animation themes
  - [x] 1.1 Define shared TypeScript types and constants
    - Create `packages/shared/src/types/pipeline.types.ts` with all shared interfaces: `WordTimestamp`, `SceneBoundary`, `SceneBeat`, `SceneDirection`, `ScenePlan`, `AnimationTheme`, `PipelineJobDto`, `PipelineStatus`, `PipelineStage`, `VideoFormat`, `PipelineErrorCode`
    - Create `packages/shared/src/types/format-config.ts` with `FORMAT_WORD_RANGES` and `FORMAT_RESOLUTIONS` constants
    - Export all types from `packages/shared/src/index.ts`
    - _Requirements: 1.4, 6.1, 6.2, 8.1, 8.3, 10.2, 11.1_

  - [x] 1.2 Define shared Zod validation schemas
    - Create `packages/shared/src/schemas/pipeline.schema.ts` with `createPipelineJobSchema`, `approveScriptSchema`, `wordTimestampSchema`, `sceneBoundarySchema`, `sceneBoundariesResponseSchema`
    - Export all schemas from `packages/shared/src/index.ts`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.4, 3.5, 6.1, 6.3_

  - [x] 1.3 Define animation theme presets
    - Create `packages/shared/src/themes/animation-themes.ts` with the 6 predefined themes (Studio, Studio Violet, Neon, Ocean, Daylight, Clean Slate) implementing the `AnimationTheme` interface
    - Export `ANIMATION_THEMES` array and `DEFAULT_THEME_ID` constant
    - _Requirements: 1.6, 1.7, 1.8_


- [x] 2. Backend domain layer — entities, value objects, and interfaces
  - [x] 2.1 Create pipeline domain value objects
    - Create `apps/api/src/pipeline/domain/value-objects/video-format.ts` — `VideoFormat` value object ("reel" | "short" | "longform")
    - Create `apps/api/src/pipeline/domain/value-objects/pipeline-stage.ts` — `PipelineStage` enum with all 10 stages
    - Create `apps/api/src/pipeline/domain/value-objects/pipeline-status.ts` — `PipelineStatus` enum (pending, processing, awaiting_script_review, awaiting_scene_plan_review, completed, failed)
    - Create `apps/api/src/pipeline/domain/value-objects/animation-theme.ts` — `AnimationTheme` value object wrapping theme ID with validation
    - Create `apps/api/src/pipeline/domain/value-objects/job-error.ts` — `JobError` value object with error code + message
    - _Requirements: 1.4, 1.5, 1.7, 11.1, 11.5_

  - [x] 2.2 Create PipelineJob entity with stage transition logic
    - Create `apps/api/src/pipeline/domain/entities/pipeline-job.ts` with the `PipelineJob` entity
    - Implement stage transition state machine: enforce valid transitions per the pipeline flow (script_generation → script_review → tts_generation → transcription → scene_planning → scene_plan_review → direction_generation → code_generation → rendering → done)
    - Implement backward transitions for regeneration: script_review → script_generation, scene_plan_review → scene_planning
    - Implement artifact setters: `setScript()`, `setApprovedScript()`, `setAudioPath()`, `setTranscript()`, `setScenePlan()`, `setSceneDirections()`, `setGeneratedCode()`, `setVideoPath()`
    - Implement `markFailed(errorCode, errorMessage)` and `transitionTo(stage)` methods using `Result<T, E>` pattern
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.7, 12.1, 12.2_

  - [ ]* 2.3 Write property tests for PipelineJob entity
    - **Property 7: Pipeline stage sequencing** — verify valid transitions are accepted and invalid transitions are rejected
    - **Property 8: Review stage pause** — verify script_generation completion → awaiting_script_review, scene_planning completion → awaiting_scene_plan_review
    - **Property 10: Terminal state correctness** — verify completed jobs have videoPath, failed jobs have errorCode + errorMessage
    - **Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.7**

  - [x] 2.4 Create pipeline domain errors
    - Create `apps/api/src/pipeline/domain/errors/pipeline-errors.ts` with `PipelineError` class extending `Error`, including error code and message
    - Define error factory methods for each `PipelineErrorCode`
    - _Requirements: 2.5, 4.5, 5.4, 6.6, 8.6, 9.7, 10.6_

  - [x] 2.5 Create pipeline repository interface
    - Create `apps/api/src/pipeline/domain/interfaces/repositories/pipeline-job-repository.ts` with `PipelineJobRepository` interface: `save()`, `findById()`, `findAll(page, limit)`, `count()`
    - _Requirements: 12.1, 12.4_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend infrastructure — Prisma schema, repository, queue, and object store
  - [x] 4.1 Add Prisma schema for pipeline models
    - Add `PipelineStatus`, `PipelineStage`, `VideoFormat` enums to `apps/api/prisma/schema.prisma`
    - Add `PipelineJob` model with all fields from the design (topic, format, themeId, status, stage, error fields, all artifact fields, progressPercent)
    - Add `AnimationTheme` model with id, name, description, palette (Json), isDefault, sortOrder
    - Add indexes on `status` and `createdAt(sort: Desc)` for PipelineJob, `sortOrder` for AnimationTheme
    - Run `npx prisma migrate dev --name add-pipeline-models`
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 4.2 Create Prisma pipeline job repository
    - Create `apps/api/src/pipeline/infrastructure/repositories/prisma-pipeline-job.repository.ts` implementing `PipelineJobRepository`
    - Create `apps/api/src/pipeline/infrastructure/mappers/pipeline-job.mapper.ts` to map between Prisma records and domain `PipelineJob` entity
    - _Requirements: 12.1, 12.2, 12.4_

  - [ ]* 4.3 Write property tests for job creation round-trip
    - **Property 1: Job creation round-trip** — create a job via repository, read it back, verify all fields match
    - **Property 12: Job listing pagination order** — verify listing returns jobs ordered by createdAt descending with correct pagination
    - **Validates: Requirements 1.1, 1.7, 12.1, 12.4**

  - [x] 4.4 Create MinIO/S3 object store adapter
    - Create `apps/api/src/pipeline/infrastructure/services/minio-object-store.ts` implementing the `ObjectStore` interface
    - Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for S3-compatible operations
    - Implement `upload()` and `getSignedUrl()` methods
    - _Requirements: 4.2, 10.5, 12.3_

  - [x] 4.5 Set up BullMQ queue and worker infrastructure
    - Create `apps/api/src/pipeline/infrastructure/queue/pipeline-queue.ts` with BullMQ queue definition and stage-specific retry configs
    - Create `apps/api/src/pipeline/infrastructure/queue/queue-service.ts` implementing the `QueueService` interface
    - Install `bullmq` dependency in `apps/api`
    - _Requirements: 11.1, 11.7_


- [x] 5. Backend application layer — use cases
  - [x] 5.1 Implement CreatePipelineJobUseCase
    - Create `apps/api/src/pipeline/application/use-cases/create-pipeline-job.use-case.ts`
    - Validate input with `createPipelineJobSchema`, create `PipelineJob` entity, persist via repository, enqueue script_generation stage via `QueueService`
    - Return job ID and initial status
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8_

  - [ ]* 5.2 Write property tests for CreatePipelineJobUseCase
    - **Property 2: Topic prompt validation** — verify 3–500 char topics are accepted, others rejected
    - **Validates: Requirements 1.2, 1.3**

  - [x] 5.3 Implement GetJobStatusUseCase
    - Create `apps/api/src/pipeline/application/use-cases/get-job-status.use-case.ts`
    - Fetch job by ID, generate signed URL for videoPath if completed, map to `PipelineJobDto`
    - Return 404 error if job not found
    - _Requirements: 11.6, 12.1_

  - [x] 5.4 Implement ApproveScriptUseCase
    - Create `apps/api/src/pipeline/application/use-cases/approve-script.use-case.ts`
    - Validate job is in `awaiting_script_review` status (409 if not)
    - If edited script provided: validate word count against format range (min 10 words, within FORMAT_WORD_RANGES)
    - Set approved script (edited or original generated), transition to tts_generation, enqueue TTS stage
    - _Requirements: 3.3, 3.4, 3.5_

  - [ ]* 5.5 Write property tests for ApproveScriptUseCase
    - **Property 3: Script approval validation** — verify word count validation, state transitions, and approvedScript assignment
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x] 5.6 Implement ApproveScenePlanUseCase
    - Create `apps/api/src/pipeline/application/use-cases/approve-scene-plan.use-case.ts`
    - Validate job is in `awaiting_scene_plan_review` status (409 if not)
    - Transition to direction_generation, enqueue direction stage
    - _Requirements: 7.4, 7.5_

  - [x] 5.7 Implement RegenerateScriptUseCase
    - Create `apps/api/src/pipeline/application/use-cases/regenerate-script.use-case.ts`
    - Validate job is in `awaiting_script_review` status
    - Reset to script_generation stage, clear generated script, enqueue script_generation
    - _Requirements: 3.7_

  - [x] 5.8 Implement RegenerateScenePlanUseCase
    - Create `apps/api/src/pipeline/application/use-cases/regenerate-scene-plan.use-case.ts`
    - Validate job is in `awaiting_scene_plan_review` status
    - Reset to scene_planning stage, clear scene plan, enqueue scene_planning
    - _Requirements: 7.6_

  - [x] 5.9 Implement ListPipelineJobsUseCase
    - Create `apps/api/src/pipeline/application/use-cases/list-pipeline-jobs.use-case.ts`
    - Fetch paginated jobs ordered by createdAt descending, return with total count
    - _Requirements: 12.4_

- [x] 6. Backend application layer — service port interfaces
  - [x] 6.1 Define all application-layer port interfaces
    - Create `apps/api/src/pipeline/application/interfaces/script-generator.ts` — `ScriptGenerator` interface
    - Create `apps/api/src/pipeline/application/interfaces/tts-service.ts` — `TTSService` interface
    - Create `apps/api/src/pipeline/application/interfaces/transcription-service.ts` — `TranscriptionService` interface
    - Create `apps/api/src/pipeline/application/interfaces/scene-planner.ts` — `ScenePlanner` interface
    - Create `apps/api/src/pipeline/application/interfaces/direction-generator.ts` — `DirectionGenerator` interface
    - Create `apps/api/src/pipeline/application/interfaces/code-generator.ts` — `CodeGenerator` interface
    - Create `apps/api/src/pipeline/application/interfaces/video-renderer.ts` — `VideoRenderer` interface
    - Create `apps/api/src/pipeline/application/interfaces/object-store.ts` — `ObjectStore` interface
    - Create `apps/api/src/pipeline/application/interfaces/queue-service.ts` — `QueueService` interface
    - _Requirements: 2.1, 4.1, 5.1, 6.1, 8.1, 9.1, 10.1_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 8. Backend presentation layer — controllers, routes, DTOs, and factory
  - [x] 8.1 Create pipeline DTOs
    - Create `apps/api/src/pipeline/presentation/dtos/create-job.dto.ts` — request/response DTOs for job creation
    - Create `apps/api/src/pipeline/presentation/dtos/approve-script.dto.ts` — request DTO for script approval
    - Create `apps/api/src/pipeline/presentation/dtos/approve-scene-plan.dto.ts` — request DTO for scene plan approval
    - _Requirements: 1.1, 3.3, 7.4_

  - [x] 8.2 Create pipeline controller
    - Create `apps/api/src/pipeline/presentation/controllers/pipeline.controller.ts` implementing the `Controller` interface
    - Handle all REST endpoints: POST /jobs, GET /jobs/:id, GET /jobs, POST /jobs/:id/approve-script, POST /jobs/:id/regenerate-script, POST /jobs/:id/approve-scene-plan, POST /jobs/:id/regenerate-scene-plan, GET /themes
    - Use Zod schemas for request validation, return structured error responses (400, 404, 409)
    - _Requirements: 1.1, 1.2, 1.3, 3.3, 3.7, 7.4, 7.6, 11.6, 12.4_

  - [x] 8.3 Create pipeline routes
    - Create `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts` mapping HTTP methods/paths to controller methods via `ControllerFactory`
    - _Requirements: 1.1, 3.3, 7.4, 11.6, 12.4_

  - [x] 8.4 Create pipeline factory (composition root)
    - Create `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`
    - Wire all dependencies: Prisma repository, queue service, use cases, controller
    - Export a function that returns the configured Express router
    - _Requirements: 1.1_

  - [x] 8.5 Register pipeline routes in Express app
    - Update `apps/api/src/shared/presentation/http/app.ts` to mount pipeline routes at `/api/pipeline`
    - _Requirements: 1.1_

- [x] 9. Backend infrastructure — AI service adapters (Vercel AI SDK)
  - [x] 9.1 Implement AI script generator
    - Create `apps/api/src/pipeline/infrastructure/services/ai-script-generator.ts` implementing `ScriptGenerator`
    - Use `generateText` from Vercel AI SDK with system prompt that includes format-specific word range from `FORMAT_WORD_RANGES`
    - Install `ai` and `@ai-sdk/openai` dependencies in `apps/api`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 9.2 Implement AI transcription service
    - Create `apps/api/src/pipeline/infrastructure/services/ai-transcription-service.ts` implementing `TranscriptionService`
    - Use Vercel AI SDK to transcribe audio and produce `WordTimestamp[]` with word-level start/end times
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 9.3 Write property test for transcript round-trip
    - **Property 4: Transcript text round-trip** — verify concatenating WordTimestamp words produces text equivalent to original script
    - **Validates: Requirements 5.5**

  - [x] 9.4 Implement AI scene planner
    - Create `apps/api/src/pipeline/infrastructure/services/ai-scene-planner.ts` implementing `ScenePlanner`
    - Use `generateObject` from Vercel AI SDK with `sceneBoundariesResponseSchema` for structured output
    - Validate scene count (2–15), types, time boundary coverage (no gaps/overlaps), and full transcript coverage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.5 Write property tests for scene plan validation
    - **Property 5: Scene plan validity** — verify scene count, types, sorted boundaries with no gaps/overlaps, full coverage
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [x] 9.6 Implement AI direction generator
    - Create `apps/api/src/pipeline/infrastructure/services/ai-direction-generator.ts` implementing `DirectionGenerator`
    - Use `generateText` from Vercel AI SDK with theme-influenced system prompt
    - Accept previous scene direction for visual continuity
    - Validate beat count (2–4) and beat time range coverage
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 9.7 Write property tests for scene direction validation
    - **Property 6: Scene direction validity** — verify fields, beat count, and beat time range coverage
    - **Validates: Requirements 8.1, 8.3, 8.4**

  - [x] 9.8 Implement AI code generator
    - Create `apps/api/src/pipeline/infrastructure/services/ai-code-generator.ts` implementing `CodeGenerator`
    - Use `generateText` from Vercel AI SDK with theme-influenced system prompt
    - Validate generated code contains a "Main" component export; retry up to 2 times if missing
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Backend infrastructure — ElevenLabs TTS integration
  - [x] 11.1 Implement ElevenLabs TTS service adapter
    - Create `apps/api/src/pipeline/infrastructure/services/elevenlabs-tts-service.ts` implementing `TTSService`
    - Call ElevenLabs Text-to-Speech API with configurable voice ID
    - Store generated MP3 audio in object store via `ObjectStore` interface
    - Return audio storage path
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [ ]* 11.2 Write unit tests for ElevenLabs TTS service
    - Test successful audio generation and storage
    - Test retry with exponential backoff (3 attempts) on API errors
    - Test failure after all retries exhausted produces "tts_generation_failed" error
    - _Requirements: 4.4, 4.5_

- [x] 12. Backend infrastructure — Remotion video renderer
  - [x] 12.1 Implement Remotion video renderer adapter
    - Create `apps/api/src/pipeline/infrastructure/services/remotion-video-renderer.ts` implementing `VideoRenderer`
    - Use Remotion server-side rendering APIs (`bundle`, `renderMedia`)
    - Apply format-specific resolution from `FORMAT_RESOLUTIONS` (1080×1920 for reel/short, 1920×1080 for longform)
    - Render at 30fps, output MP4 with H.264 video + AAC audio
    - Store rendered video in object store, return video path
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 12.2 Write property test for format-to-resolution mapping
    - **Property 11: Format-to-resolution mapping** — verify deterministic resolution lookup for all 3 formats
    - **Validates: Requirements 10.2**

- [x] 13. Backend infrastructure — BullMQ workers
  - [x] 13.1 Implement script generation worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/script-generation.worker.ts`
    - Call `ScriptGenerator`, update job with generated script, transition to `awaiting_script_review`
    - Configure 3 retry attempts with exponential backoff (2s base)
    - _Requirements: 2.1, 2.5, 3.1, 3.6_

  - [x] 13.2 Implement TTS generation worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/tts-generation.worker.ts`
    - Call `TTSService` with approved script, update job with audio path, enqueue transcription
    - Configure 3 retry attempts with exponential backoff (3s base)
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 13.3 Implement transcription worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/transcription.worker.ts`
    - Call `TranscriptionService` with audio path, update job with transcript, enqueue scene_planning
    - Configure 1 retry attempt
    - _Requirements: 5.1, 5.4_

  - [x] 13.4 Implement scene planning worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/scene-planning.worker.ts`
    - Call `ScenePlanner`, update job with scene plan, transition to `awaiting_scene_plan_review`
    - Configure 2 retry attempts with exponential backoff (2s base)
    - _Requirements: 6.1, 6.6, 7.1, 7.5_

  - [x] 13.5 Implement direction generation worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/direction-generation.worker.ts`
    - Iterate over scene boundaries, call `DirectionGenerator` for each scene (passing previous direction for continuity)
    - Update job with all scene directions, enqueue code_generation
    - Configure 2 retry attempts with exponential backoff (2s base)
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [x] 13.6 Implement code generation worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`
    - Call `CodeGenerator` with full scene plan and theme, validate "Main" export, store code in object store
    - Update job with generated code and code path, enqueue rendering
    - Configure 2 retry attempts with exponential backoff (2s base)
    - _Requirements: 9.1, 9.2, 9.4, 9.6, 9.7_

  - [x] 13.7 Implement video rendering worker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/video-rendering.worker.ts`
    - Call `VideoRenderer` with code, scene plan, audio, and format
    - Update job with video path, transition to `completed`
    - Configure 1 retry attempt
    - _Requirements: 10.1, 10.5, 10.6, 11.4_

  - [ ]* 13.8 Write property tests for stage completion persistence
    - **Property 9: Stage completion persistence** — verify each worker updates the correct artifact field and advances the stage
    - **Validates: Requirements 11.2, 12.2**

- [x] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 15. Frontend setup — shadcn/ui, color palette, and theming
  - [x] 15.1 Install and configure shadcn/ui
    - Install shadcn/ui CLI and initialize with dark mode, zinc base color, and CSS variables
    - Add required shadcn/ui components: Button, Card, Input, Textarea, Badge, Progress, Table, Tabs, Separator
    - _Requirements: 1.6, 3.2, 7.2_

  - [x] 15.2 Configure dark-mode color palette
    - Update `apps/web/src/app/globals.css` with the design's CSS custom properties (zinc backgrounds, cyan primary, amber review, emerald success, red error)
    - Add pipeline stage semantic colors (`--stage-pending`, `--stage-active`, `--stage-review`, `--stage-complete`, `--stage-failed`)
    - _Requirements: 1.6, 7.2, 7.3_

- [x] 16. Frontend feature module — pipeline types, interfaces, and repository
  - [x] 16.1 Create pipeline feature types
    - Create `apps/web/src/features/pipeline/types/pipeline.types.ts` re-exporting shared types and adding any frontend-specific types
    - _Requirements: 1.1, 11.6_

  - [x] 16.2 Create pipeline repository interface and HTTP implementation
    - Create `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts` with `PipelineRepository` interface: `createJob()`, `getJobStatus()`, `approveScript()`, `approveScenePlan()`, `regenerateScript()`, `regenerateScenePlan()`, `listJobs()`, `getThemes()`
    - Create `apps/web/src/features/pipeline/repositories/http-pipeline.repository.ts` implementing `PipelineRepository` using `HttpClient`
    - _Requirements: 1.1, 3.3, 3.7, 7.4, 7.6, 11.6, 12.4_

  - [x] 16.3 Create pipeline frontend use cases
    - Create `apps/web/src/features/pipeline/application/usecases/create-pipeline-job.usecase.ts`
    - Create `apps/web/src/features/pipeline/application/usecases/get-job-status.usecase.ts`
    - Create `apps/web/src/features/pipeline/application/usecases/approve-script.usecase.ts`
    - Create `apps/web/src/features/pipeline/application/usecases/approve-scene-plan.usecase.ts`
    - Create `apps/web/src/features/pipeline/application/usecases/list-pipeline-jobs.usecase.ts`
    - _Requirements: 1.1, 3.3, 7.4, 11.6, 12.4_

- [x] 17. Frontend feature module — pipeline components
  - [x] 17.1 Create FormatSelector component
    - Create `apps/web/src/features/pipeline/components/format-selector.tsx` — card group for reel/short/longform selection
    - Display format name, aspect ratio, and duration range per card
    - _Requirements: 1.4_

  - [x] 17.2 Create ThemeSelector component
    - Create `apps/web/src/features/pipeline/components/theme-selector.tsx` — grid of theme preview cards
    - Display theme name, description, and color palette preview swatch for each theme
    - Highlight selected theme, support default selection
    - _Requirements: 1.6, 1.8_

  - [x] 17.3 Create PipelineWizard component
    - Create `apps/web/src/features/pipeline/components/pipeline-wizard.tsx` — multi-step creation form
    - Step 1: Topic textarea + FormatSelector + ThemeSelector → submit creates job
    - Validate topic length (3–500 chars) client-side before submission
    - _Requirements: 1.1, 1.2, 1.4, 1.6_

  - [x] 17.4 Create JobStatusTracker component
    - Create `apps/web/src/features/pipeline/components/job-status-tracker.tsx` — pipeline progress indicator
    - Display all stages with semantic colors (pending/active/review/complete/failed)
    - Show progress percentage
    - _Requirements: 11.6_

  - [x] 17.5 Create ScriptReviewEditor component
    - Create `apps/web/src/features/pipeline/components/script-review-editor.tsx` — editable script review
    - Display generated script in editable textarea with live word count
    - Show validation warning if word count < 10 or outside format range
    - Approve and Regenerate action buttons
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 17.6 Create ScenePlanTimeline and ScenePlanCard components
    - Create `apps/web/src/features/pipeline/components/scene-plan-timeline.tsx` — horizontal timeline visualization showing scene boundaries relative to total duration
    - Create `apps/web/src/features/pipeline/components/scene-plan-card.tsx` — individual scene card showing name, type, start/end time, duration, and text excerpt
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 17.7 Create JobListTable component
    - Create `apps/web/src/features/pipeline/components/job-list-table.tsx` — paginated job history table
    - Display job topic, format, status, stage, created date, and link to detail page
    - Support pagination controls
    - _Requirements: 12.4_

- [x] 18. Frontend — hooks and polling
  - [x] 18.1 Create usePipelineJob hook
    - Create `apps/web/src/features/pipeline/hooks/use-pipeline-job.ts` — job status polling hook
    - Poll GET /api/pipeline/jobs/:id at regular intervals while job is processing
    - Stop polling when job reaches terminal state (completed/failed) or review state
    - _Requirements: 11.6_

  - [x] 18.2 Create useCreatePipeline hook
    - Create `apps/web/src/features/pipeline/hooks/use-create-pipeline.ts` — creation form state management
    - Manage topic, format, and theme selection state
    - Handle form submission via CreatePipelineJobUseCase
    - _Requirements: 1.1_

- [x] 19. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 20. Frontend — pages and routing
  - [x] 20.1 Create pipeline creation page
    - Create `apps/web/src/app/create/page.tsx` rendering the PipelineWizard component
    - After job creation, navigate to job detail page
    - _Requirements: 1.1_

  - [x] 20.2 Create job detail page
    - Create `apps/web/src/app/jobs/[id]/page.tsx` rendering the job detail/review page
    - Show JobStatusTracker, ScriptReviewEditor (when awaiting_script_review), ScenePlanTimeline + ScenePlanCards (when awaiting_scene_plan_review), and video player (when completed)
    - Wire approve/regenerate actions to use cases
    - _Requirements: 3.1, 7.1, 11.6_

  - [x] 20.3 Update dashboard page with job list
    - Update `apps/web/src/app/page.tsx` to render JobListTable with paginated job history
    - Add "Create New Video" button linking to /create
    - _Requirements: 12.4_

  - [x] 20.4 Register pipeline dependencies in AppDependenciesProvider
    - Update `apps/web/src/shared/providers/app-dependencies-context.tsx` to include `PipelineRepository` in the DI context
    - Instantiate `HttpPipelineRepository` with the existing `HttpClient`
    - _Requirements: 1.1_

- [x] 21. Integration and wiring — backend worker registration
  - [x] 21.1 Create worker registration and startup
    - Create `apps/api/src/pipeline/infrastructure/queue/worker-registry.ts` to instantiate and start all 7 BullMQ workers with their dependencies
    - Wire each worker with its service adapter, repository, and queue service
    - _Requirements: 11.1, 11.7_

  - [x] 21.2 Wire worker startup into API server
    - Update `apps/api/src/shared/presentation/http/server.ts` to initialize and start pipeline workers alongside the Express server
    - Ensure graceful shutdown of workers on process termination
    - _Requirements: 11.1_

  - [x] 21.3 Add theme seeding
    - Create `apps/api/src/pipeline/infrastructure/seed/seed-themes.ts` to seed the 6 animation themes into the AnimationTheme table
    - Add a `db:seed` script to `apps/api/package.json`
    - _Requirements: 1.6, 1.8_

  - [x] 21.4 Add environment variables for new services
    - Update `video-ai/.env.example` with new env vars: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
    - _Requirements: 2.1, 4.1, 4.3_

- [x] 22. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The build order ensures no orphaned code — each task builds on previous tasks
- All AI service adapters follow the same Vercel AI SDK pattern (generateText/generateObject)
- All workers follow the same BullMQ pattern (fetch job → call service → update job → enqueue next)
