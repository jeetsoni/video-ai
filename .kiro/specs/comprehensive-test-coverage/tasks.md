# Implementation Plan: Comprehensive Test Coverage

## Overview

This plan creates test files across the video-ai monorepo to close the highest-impact testing gaps. Work is organized in four groups: shared package setup, property-based tests, use case tests, and final verification. All tests use Jest 29.7 with ts-jest ESM preset and follow existing patterns from `list-voices.use-case.test.ts` and `ai-script-tweaker.test.ts`. Test files are co-located with their source files.

## Tasks

- [x] 1. Set up shared package testing dependencies and create constant/registry tests
  - [x] 1.1 Install fast-check in packages/shared
    - Run `npm install -D fast-check` in `packages/shared`
    - Verify fast-check 3.22.0 is added to `packages/shared/package.json` devDependencies
    - _Requirements: 9.1, 11.1 (prerequisite for shared PBTs)_

  - [x] 1.2 Create shared package constant and registry tests
    - Create `packages/shared/src/shared-exports.test.ts`
    - Test `FEATURED_VOICES` exports exactly 3 voices with valid voiceId, name, category, gender, description
    - Test `DEFAULT_VOICE_ID` matches the voiceId of the first featured voice
    - Test `FEATURED_VOICE_IDS` set contains exactly the voiceIds from `FEATURED_VOICES`
    - Test `FORMAT_WORD_RANGES` defines min/max for "reel", "short", "longform" where min < max
    - Test `FORMAT_RESOLUTIONS` defines width/height for all three formats with positive integers
    - Test `SCENE_SFX_MAP` defines an SfxProfile for all 8 scene types with valid ambience and transition filenames
    - Test `ALL_SFX_ASSETS` contains all ambient, transition, and utility assets combined
    - Test `ALL_SFX_FILENAMES` has same length as `ALL_SFX_ASSETS` and contains only `.mp3` filenames
    - Test `voiceSettingsSchema` parses valid objects with speed, stability, similarityBoost, style within ranges
    - Test `voiceSettingsSchema` rejects speed outside 0.7–1.2 range
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

- [x] 2. Implement property-based tests for shared package schemas
  - [x] 2.1 Create ScriptStreamEvent round-trip property test
    - Create `packages/shared/src/schemas/script-stream-event.schema.test.ts`
    - Build custom fast-check arbitraries for all 5 event variants (chunk, status, scene, done, error) using `sceneBlockSchema` constraints
    - Write property: for all generated events, `JSON.stringify` → `JSON.parse` → `scriptStreamEventSchema.parse` produces deeply equal object
    - Write property: for all generated events, `JSON.stringify` produces valid JSON parseable by `JSON.parse`
    - Write property: for all generated events, the `type` discriminator is preserved through round-trip
    - Use `fc.assert(fc.property(...))` with `{ numRuns: 100 }`
    - Add tag comment: `Feature: comprehensive-test-coverage, Property 1: ScriptStreamEvent JSON round-trip preserves data`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.2 Create createPipelineJobSchema property tests
    - Create `packages/shared/src/schemas/pipeline.schema.test.ts`
    - Build arbitraries: `validTopicArb` (3–500 chars), `validFormatArb` (constantFrom "reel","short","longform"), `validThemeIdArb` (non-empty string)
    - Write property: for all valid inputs, `createPipelineJobSchema.safeParse` returns success with matching data
    - Build `shortTopicArb` (0–2 chars) and write property: for all short topics, safeParse returns failure
    - Build `invalidFormatArb` (string not in valid formats) and write property: for all invalid formats, safeParse returns failure
    - Write property for voiceSettingsSchema: valid ranges succeed, speed outside 0.7–1.2 fails
    - Use `fc.assert(fc.property(...))` with `{ numRuns: 100 }`
    - Add tag comments: `Feature: comprehensive-test-coverage, Property 3/4/5/6`
    - _Requirements: 11.1, 11.2, 11.3, 12.9, 12.10_

- [x] 3. Implement PipelineStage transition property test
  - [x] 3.1 Create PipelineStage transition validity property test
    - Create `apps/api/src/pipeline/domain/value-objects/pipeline-stage.property.test.ts`
    - Build `pipelineStageArb` using `fc.constantFrom` over all 10 stage values
    - Build `stagePairArb` as `fc.tuple(pipelineStageArb, pipelineStageArb)`
    - Write property: for all stage pairs where `canTransitionTo` returns true, `PipelineJob.transitionTo` succeeds and stage equals target
    - Write property: for all stage pairs where `canTransitionTo` returns false, `PipelineJob.transitionTo` returns failed Result with code "INVALID_TRANSITION"
    - Write property: for all valid stage strings, `PipelineStage.create` returns non-null
    - Use factory function `makeJobAtStage` that walks the transition graph to reach target stage
    - Use `fc.assert(fc.property(...))` with `{ numRuns: 100 }`
    - Add tag comment: `Feature: comprehensive-test-coverage, Property 2: PipelineStage transition graph correctness`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 4. Checkpoint - Verify shared package and PBT tests pass
  - Run `cd packages/shared && NODE_OPTIONS='--experimental-vm-modules' npx jest --passWithNoTests` and verify all shared tests pass
  - Run `cd apps/api && NODE_OPTIONS='--experimental-vm-modules' npx jest --passWithNoTests --testPathPattern="pipeline-stage.property"` and verify PipelineStage PBT passes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement CreatePipelineJob and ApproveScript use case tests
  - [x] 5.1 Create CreatePipelineJob use case tests
    - Create `apps/api/src/pipeline/application/use-cases/create-pipeline-job.use-case.test.ts`
    - Set up mock `PipelineJobRepository`, `QueueService`, and `IdGenerator` following `list-voices.use-case.test.ts` pattern
    - Test happy path: valid request returns successful Result with job id and "pending" status
    - Test repository.save called exactly once with a PipelineJob entity
    - Test queueService.enqueue called with stage "script_generation" and the generated job id
    - Test invalid format returns failed Result with ValidationError
    - Test topic shorter than 3 chars returns failed Result with code "INVALID_INPUT"
    - Test QueueService failure returns failed Result with code "QUEUE_ERROR"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 5.2 Create ApproveScript use case tests
    - Create `apps/api/src/pipeline/application/use-cases/approve-script.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `QueueService`
    - Use factory function `makeJobAtStage("script_review")` to create jobs in the correct state with a generated script and scenes
    - Test happy path: job in "awaiting_script_review" with no edited script approves generated script
    - Test edited script within format word range transitions to "tts_generation"
    - Test edited script with fewer than 10 words returns code "INVALID_WORD_COUNT"
    - Test edited script outside format word range returns code "INVALID_WORD_COUNT"
    - Test non-existent jobId returns code "NOT_FOUND"
    - Test job not in "awaiting_script_review" returns code "CONFLICT"
    - Test voiceId in request updates job voice selection before approving
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 6. Implement GetJobStatus and RegenerateScript use case tests
  - [x] 6.1 Create GetJobStatus use case tests
    - Create `apps/api/src/pipeline/application/use-cases/get-job-status.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `ObjectStore`
    - Test happy path: existing job returns PipelineJobDto with all base fields mapped
    - Test completed job with videoPath includes signed videoUrl in DTO
    - Test job with error includes errorCode and errorMessage in DTO
    - Test job in "preview" or "done" with generated code includes codeChanged field
    - Test non-existent jobId returns code "NOT_FOUND"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.2 Create RegenerateScript use case tests
    - Create `apps/api/src/pipeline/application/use-cases/regenerate-script.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `QueueService`
    - Test happy path: job in "awaiting_script_review" transitions to "script_generation" and returns success
    - Test queueService.enqueue called with stage "script_generation"
    - Test non-existent jobId returns code "NOT_FOUND"
    - Test job not in "awaiting_script_review" returns code "CONFLICT"
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Implement RetryJob and ExportVideo use case tests
  - [x] 7.1 Create RetryJob use case tests
    - Create `apps/api/src/pipeline/application/use-cases/retry-job.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `QueueService`
    - Use factory to create jobs in "failed" status at a processing stage (e.g., "tts_generation")
    - Test happy path: failed job at processing stage clears failure, saves, and enqueues for current stage
    - Test stuck processing job re-enqueues for current stage
    - Test non-retryable status ("awaiting_script_review", "completed") returns code "CONFLICT"
    - Test non-existent jobId returns code "NOT_FOUND"
    - Test QueueService failure returns code "QUEUE_ERROR"
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.2 Create ExportVideo use case tests
    - Create `apps/api/src/pipeline/application/use-cases/export-video.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `QueueService`
    - Test happy path: job in "preview" transitions to "rendering" and enqueues rendering job
    - Test job in "done" clears video URL, transitions to "rendering", and enqueues
    - Test job not in "preview" or "done" returns code "INVALID_STAGE"
    - Test non-existent jobId returns code "NOT_FOUND"
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Checkpoint - Verify use case tests pass
  - Run `cd apps/api && NODE_OPTIONS='--experimental-vm-modules' npx jest --passWithNoTests` and verify all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement ListPipelineJobs and GetPreviewData use case tests
  - [x] 9.1 Create ListPipelineJobs use case tests
    - Create `apps/api/src/pipeline/application/use-cases/list-pipeline-jobs.use-case.test.ts`
    - Set up mock `PipelineJobRepository`
    - Test happy path: valid page/limit returns jobs array, total, page, limit
    - Test page < 1 returns code "INVALID_INPUT"
    - Test limit < 1 returns code "INVALID_INPUT"
    - Test browserId filter is passed to repository.findAll and repository.count
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 9.2 Create GetPreviewData use case tests
    - Create `apps/api/src/pipeline/application/use-cases/get-preview-data.use-case.test.ts`
    - Set up mock `PipelineJobRepository` and `ObjectStore`
    - Use factory to create a job in "preview" stage with generatedCode, sceneDirections, transcript, and audioPath set
    - Test happy path: job in "preview" with all artifacts returns code, scenePlan, audioUrl, format, fps, totalFrames, compositionWidth, compositionHeight
    - Test job not in valid preview stage ("preview", "rendering", "done") returns code "NOT_FOUND"
    - Test job with no generated code returns code "NOT_FOUND"
    - Test job with no scene directions returns code "NOT_FOUND"
    - Test job with no transcript returns code "NOT_FOUND"
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Final checkpoint - Run all tests across the monorepo
  - Run `cd packages/shared && NODE_OPTIONS='--experimental-vm-modules' npx jest --passWithNoTests` and verify all shared package tests pass
  - Run `cd apps/api && NODE_OPTIONS='--experimental-vm-modules' npx jest --passWithNoTests` and verify all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All test files are co-located with source files (same directory), following existing project convention
- Tests use Jest 29.7 with ts-jest ESM preset and `NODE_OPTIONS='--experimental-vm-modules'`
- fast-check 3.22.0 is already in apps/api and apps/web; needs to be added to packages/shared
- Property-based tests use `{ numRuns: 100 }` minimum iterations
- Each use case test follows the mock setup pattern from `list-voices.use-case.test.ts`
- Each PBT follows the arbitrary/assert pattern from `ai-script-tweaker.test.ts`
- Factory functions (`makeJob`, `makeJobAtStage`, `makeSceneBoundary`, etc.) are defined per test file to create domain entities in specific states
- Checkpoints ensure incremental validation at natural breakpoints
- Each task references specific requirements for traceability
