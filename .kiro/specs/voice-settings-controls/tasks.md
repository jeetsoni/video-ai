# Implementation Plan: Voice Settings Controls

## Overview

Add four ElevenLabs voice tuning sliders (Speed, Stability, Similarity Boost, Style) to the Pipeline Wizard. The implementation flows bottom-up through the Clean Architecture layers: shared types/schema → database migration → domain entity → mapper → use cases → TTS service/worker → frontend component → wiring. Each task builds incrementally so the pipeline remains functional at every step.

## Tasks

- [x] 1. Add voice settings types, constants, and schema to the shared package
  - [x] 1.1 Create `packages/shared/src/types/voice-settings.types.ts` with `VoiceSettings` interface, `VoiceSettingRange` interface, `VOICE_SETTINGS_RANGES` constant, and `DEFAULT_VOICE_SETTINGS` constant
    - `VoiceSettings`: `{ speed: number; stability: number; similarityBoost: number; style: number }`
    - `VOICE_SETTINGS_RANGES`: min/max/step/default for each field (speed 0.7–1.2 step 0.1, stability 0.0–1.0 step 0.05, similarityBoost 0.0–1.0 step 0.05, style 0.0–1.0 step 0.05)
    - `DEFAULT_VOICE_SETTINGS`: `{ speed: 1.0, stability: 0.5, similarityBoost: 0.75, style: 0.0 }`
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Add `voiceSettingsSchema` to `packages/shared/src/schemas/pipeline.schema.ts` and add optional `voiceSettings` field to `createPipelineJobSchema`
    - `voiceSettingsSchema`: `z.object({ speed: z.number().min(0.7).max(1.2), stability: z.number().min(0).max(1), similarityBoost: z.number().min(0).max(1), style: z.number().min(0).max(1) })`
    - Add `voiceSettings: voiceSettingsSchema.optional()` to `createPipelineJobSchema`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 1.3 Export new types, constants, and schema from `packages/shared/src/index.ts`
    - Export `VoiceSettings`, `VoiceSettingRange` types
    - Export `VOICE_SETTINGS_RANGES`, `DEFAULT_VOICE_SETTINGS` constants
    - Export `voiceSettingsSchema`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]\* 1.4 Write property tests for voice settings schema validation
    - **Property 1: Schema accepts valid voice settings** — generate valid voiceSettings with speed in [0.7, 1.2], stability/similarityBoost/style in [0.0, 1.0], combined with valid base payloads; verify `createPipelineJobSchema` passes with and without voiceSettings
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  - [ ]\* 1.5 Write property test for schema rejection of out-of-range values
    - **Property 2: Schema rejects out-of-range voice settings** — generate voiceSettings with at least one field outside its valid range; verify `createPipelineJobSchema` rejects
    - **Validates: Requirements 2.7**

  - [ ]\* 1.6 Write property test for schema rejection of incomplete voice settings
    - **Property 3: Schema rejects incomplete voice settings** — generate voiceSettings objects missing 1–3 fields; verify `createPipelineJobSchema` rejects
    - **Validates: Requirements 2.8**

- [x] 2. Checkpoint — Ensure shared package builds and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add voice settings to the database and domain layer
  - [x] 3.1 Add `voiceSettings Json?` column to the `PipelineJob` model in `apps/api/prisma/schema.prisma` and run Prisma migration
    - Add `voiceSettings Json?` after the `voiceId` field
    - Run `npx prisma migrate dev --name add-voice-settings-to-pipeline-job`
    - Existing rows get `null` (backward-compatible)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Update `PipelineJob` domain entity in `apps/api/src/pipeline/domain/entities/pipeline-job.ts`
    - Import `VoiceSettings` from `@video-ai/shared`
    - Add `voiceSettings: VoiceSettings | null` to `PipelineJobProps`
    - Add `get voiceSettings()` getter
    - Update `create()` to accept optional `voiceSettings`, default to `null`
    - Update `reconstitute()` to accept `voiceSettings`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]\* 3.3 Write property test for PipelineJob entity voice settings round-trip
    - **Property 4: PipelineJob entity voice settings round-trip** — create PipelineJob with random valid VoiceSettings (or null), verify getter returns equivalent value
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.2**

- [x] 4. Update mapper and use cases to carry voice settings
  - [x] 4.1 Update `PipelineJobMapper` in `apps/api/src/pipeline/infrastructure/mappers/pipeline-job.mapper.ts`
    - Import `VoiceSettings` from `@video-ai/shared`
    - In `toDomain()`: map `record.voiceSettings` as `VoiceSettings | null`
    - In `toPersistence()`: map `job.voiceSettings` to `Prisma.JsonValue | null`
    - _Requirements: 3.1, 4.1_

  - [x] 4.2 Update `CreatePipelineJobUseCase` in `apps/api/src/pipeline/application/use-cases/create-pipeline-job.use-case.ts`
    - Add `voiceSettings` to `CreatePipelineJobRequest` interface (optional)
    - Pass `voiceSettings: parsed.data.voiceSettings ?? null` to `PipelineJob.create()`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.3 Update `GetJobStatusUseCase` and `PipelineJobDto` to include voice settings
    - Add `voiceSettings?: VoiceSettings` to `PipelineJobDto` in `packages/shared/src/types/pipeline.types.ts`
    - In `mapToDto()` in `get-job-status.use-case.ts`: add `if (job.voiceSettings) { dto.voiceSettings = job.voiceSettings; }`
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]\* 4.4 Write property test for DTO mapping preservation
    - **Property 8: DTO mapping preserves voice settings** — map PipelineJob with random voiceSettings to DTO, verify values preserved; when null, verify field omitted
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 5. Checkpoint — Ensure API builds and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update TTS service and worker to use voice settings
  - [x] 6.1 Update `TTSService` interface in `apps/api/src/pipeline/application/interfaces/tts-service.ts`
    - Import `VoiceSettings` from `@video-ai/shared`
    - Add `voiceSettings: VoiceSettings` to the `generateSpeech` params (required — worker applies default before calling)
    - _Requirements: 7.1, 7.2_

  - [x] 6.2 Update `ElevenLabsTTSService` in `apps/api/src/pipeline/infrastructure/services/elevenlabs-tts-service.ts`
    - Add `voiceSettings: VoiceSettings` to `generateSpeech` params
    - Replace hardcoded `voiceSettings: { stability: 0.5, similarityBoost: 0.75 }` with `voiceSettings: { stability: params.voiceSettings.stability, similarityBoost: params.voiceSettings.similarityBoost, style: params.voiceSettings.style }`
    - Pass `speed: params.voiceSettings.speed` as a top-level parameter to `convertWithTimestamps()`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.3 Update `TTSGenerationWorker` in `apps/api/src/pipeline/infrastructure/queue/workers/tts-generation.worker.ts`
    - Import `DEFAULT_VOICE_SETTINGS` from `@video-ai/shared`
    - Read `pipelineJob.voiceSettings`, fall back to `DEFAULT_VOICE_SETTINGS` when null
    - Pass resolved `voiceSettings` to `ttsService.generateSpeech()`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]\* 6.4 Write property test for TTS worker voice settings forwarding
    - **Property 5: TTS worker forwards job voice settings to TTS service** — process job with random non-null voiceSettings, mock TTS service, verify exact settings passed through
    - **Validates: Requirements 6.2**

  - [ ]\* 6.5 Write property test for TTS service SDK parameter mapping
    - **Property 6: TTS service maps voice settings to ElevenLabs SDK parameters** — call generateSpeech with random valid voiceSettings, mock ElevenLabs client, verify stability/similarityBoost/style inside `voiceSettings` and `speed` as top-level param
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 7. Checkpoint — Ensure API builds and all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 8. Build the frontend VoiceSettingsControls component
  - [x] 8.1 Create `apps/web/src/features/pipeline/components/voice-settings-controls.tsx`
    - Import `VoiceSettings`, `VOICE_SETTINGS_RANGES` from `@video-ai/shared`
    - Accept props: `value: VoiceSettings`, `onChange: (settings: VoiceSettings) => void`
    - Render four `<input type="range">` sliders with labels: "Speed", "Stability", "Similarity Boost", "Style"
    - Each slider: reads min/max/step from `VOICE_SETTINGS_RANGES`, displays current numeric value, includes brief description text
    - Descriptions: Speed — "Controls speaking pace. Below 1.0 slows down, above 1.0 speeds up." / Stability — "Higher values produce more consistent delivery. Lower values add expressiveness." / Similarity Boost — "Controls how closely the output matches the original voice." / Style — "Adds stylization and emotion. Higher values increase expressiveness."
    - Add `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` attributes for accessibility
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.11_

  - [ ]\* 8.2 Write property test for VoiceSettingsControls display values
    - **Property 7: Voice settings controls display correct numeric values** — render component with random valid VoiceSettings, verify displayed numeric values match input
    - **Validates: Requirements 8.2, 8.8**

- [x] 9. Wire VoiceSettingsControls into DraftHero and PipelineWizard
  - [x] 9.1 Update `CreateJobParams` in `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`
    - Import `VoiceSettings` from `@video-ai/shared`
    - Add `voiceSettings?: VoiceSettings` to `CreateJobParams`
    - _Requirements: 5.1_

  - [x] 9.2 Update `DraftHero` in `apps/web/src/features/pipeline/components/draft-hero.tsx`
    - Import `DEFAULT_VOICE_SETTINGS` from `@video-ai/shared` and `VoiceSettingsControls`
    - Add `voiceSettings` state initialized to `DEFAULT_VOICE_SETTINGS`
    - Render `<VoiceSettingsControls>` directly below the `<VoiceSelector>` section
    - Include `voiceSettings` in the `createJob()` call payload
    - _Requirements: 5.1, 8.7, 8.10_

  - [x] 9.3 Update `PipelineWizard` in `apps/web/src/features/pipeline/components/pipeline-wizard.tsx`
    - Import `DEFAULT_VOICE_SETTINGS` from `@video-ai/shared` and `VoiceSettingsControls`
    - Add `voiceSettings` state initialized to `DEFAULT_VOICE_SETTINGS`
    - Render `<VoiceSettingsControls>` directly below the `<VoiceSelector>` section
    - Include `voiceSettings` in the `onSubmit()` callback data
    - _Requirements: 5.1, 8.7, 8.10_

- [x] 10. Final checkpoint — Ensure full build passes and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each architectural layer
- Property tests use `fast-check` with Jest (minimum 100 iterations per property)
- The `voiceSettings` field is optional/nullable throughout — existing jobs are backward-compatible without data migration backfill
- `DEFAULT_VOICE_SETTINGS` is the single source of truth imported from `@video-ai/shared` by both frontend and backend
