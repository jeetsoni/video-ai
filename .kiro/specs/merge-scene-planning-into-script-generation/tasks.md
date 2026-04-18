# Implementation Plan: Merge Scene Planning into Script Generation

## Overview

Restructure the pipeline so that scene boundaries are generated alongside the script in a single AI call, eliminating the separate `scene_planning` and `scene_plan_review` stages. A deterministic timestamp mapping step replaces the AI scene planner after TTS. Implementation proceeds bottom-up: shared types first, then domain, infrastructure, application, presentation, and finally frontend.

## Tasks

- [x] 1. Shared package — update types and schemas
  - [x] 1.1 Update shared pipeline types
    - Update `packages/shared/src/types/pipeline.types.ts`:
      - Remove `scene_planning` and `scene_plan_review` from `PipelineStage` type
      - Add `timestamp_mapping` to `PipelineStage` type
      - Remove `awaiting_scene_plan_review` from `PipelineStatus` type
      - Remove `scene_planning_failed` from `PipelineErrorCode` type
      - Add `timestamp_mapping_failed` to `PipelineErrorCode` type
      - Add `generatedScenes?: SceneBoundary[]` and `approvedScenes?: SceneBoundary[]` to `PipelineJobDto`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.3_

  - [x] 1.2 Add structured script response schema
    - Create Zod schema `structuredScriptResponseSchema` in `packages/shared/src/schemas/pipeline.schema.ts` for the new script generator output: `{ script: string, scenes: [{ id, name, type, text }] }`
    - Export from `packages/shared/src/index.ts`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Backend domain — update value objects and entity
  - [x] 2.1 Update PipelineStage value object
    - Update `apps/api/src/pipeline/domain/value-objects/pipeline-stage.ts`:
      - Remove `scene_planning` and `scene_plan_review` from `STAGES_IN_ORDER`
      - Add `timestamp_mapping` between `transcription` and `direction_generation`
      - Update `VALID_TRANSITIONS`: `transcription` → `[timestamp_mapping]`, `timestamp_mapping` → `[direction_generation]`
      - Remove old transitions for `scene_planning` and `scene_plan_review`
    - Update `apps/api/src/pipeline/domain/value-objects/pipeline-status.ts`:
      - Remove `awaiting_scene_plan_review` from `VALID_STATUSES`
      - Remove `awaitingScenePlanReview()` factory method
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 2.2 Update PipelineJob entity
    - Update `apps/api/src/pipeline/domain/entities/pipeline-job.ts`:
      - Add `generatedScenes: SceneBoundary[] | null` and `approvedScenes: SceneBoundary[] | null` to `PipelineJobProps`
      - Update `setScript()` signature to accept `(script: string, scenes: SceneBoundary[])` — stores both `generatedScript` and `generatedScenes`
      - Update `setApprovedScript()` signature to accept `(script: string, scenes: SceneBoundary[])` — stores both `approvedScript` and `approvedScenes`
      - Update `setScenePlan()` stage guard to allow `timestamp_mapping` stage (in addition to or replacing `scene_planning`)
      - Add getters for `generatedScenes` and `approvedScenes`
      - Update `STAGE_TO_STATUS` and `STAGE_TO_PROGRESS` maps: remove `scene_planning`/`scene_plan_review`, add `timestamp_mapping` with progress 55
      - Initialize new fields to `null` in `create()` and accept them in `reconstitute()`
    - _Requirements: 1.1, 2.1, 2.4, 3.4, 3.5, 3.6_

  - [x] 2.3 Update PipelineJob entity tests
    - Update `apps/api/src/pipeline/domain/entities/pipeline-job.test.ts`:
      - Update `setScript()` tests to pass scenes array
      - Update stage transition tests to reflect new pipeline flow (no scene_planning/scene_plan_review)
      - Add test for `setScenePlan()` in `timestamp_mapping` stage
      - Add tests for `generatedScenes` and `approvedScenes` getters
    - _Requirements: 3.4, 2.2_

  - [x] 2.4 Update PipelineStage and PipelineStatus tests
    - Update `apps/api/src/pipeline/domain/value-objects/pipeline-stage.test.ts` to reflect removed/added stages and transitions
    - Update `apps/api/src/pipeline/domain/value-objects/pipeline-status.test.ts` to reflect removed status
    - _Requirements: 3.1, 3.2_

- [x] 3. Backend infrastructure — update mapper, add timestamp mapper
  - [x] 3.1 Update pipeline job mapper
    - Update `apps/api/src/pipeline/infrastructure/mappers/pipeline-job.mapper.ts`:
      - Map `generatedScenes` and `approvedScenes` fields between Prisma records and domain entity
    - Update mapper tests accordingly
    - _Requirements: 2.1, 2.4_

  - [x] 3.2 Create TimestampMapper service
    - Create `apps/api/src/pipeline/application/interfaces/timestamp-mapper.ts` with `TimestampMapper` interface
    - Create `apps/api/src/pipeline/infrastructure/services/text-timestamp-mapper.ts` implementing `TimestampMapper`:
      - Sequential text-matching algorithm: walk transcript words, match to scene text word-by-word
      - Assign `startTime` from first matched word's `start`, `endTime` from last matched word's `end`
      - Ensure contiguity: adjust boundaries so each scene's `endTime` = next scene's `startTime`
      - Return `Result<SceneBoundary[], PipelineError>` with `timestamp_mapping_failed` on alignment failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.3 Write tests for TimestampMapper
    - Unit tests for `TextTimestampMapper`:
      - Happy path: scenes with matching text produce correct timestamps
      - Contiguity: no gaps or overlaps between scene boundaries
      - Coverage: first scene starts at/before first word, last scene ends at/after last word
      - Determinism: same input produces same output
      - Error case: mismatched text produces failure result
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.4 Create TimestampMappingWorker
    - Create `apps/api/src/pipeline/infrastructure/queue/workers/timestamp-mapping.worker.ts`:
      - Fetch job, get `approvedScenes` and `transcript`
      - Call `TimestampMapper.mapTimestamps()`
      - Set scene plan via `pipelineJob.setScenePlan()`
      - Transition to `direction_generation`, enqueue next stage
    - _Requirements: 4.1, 4.7_

  - [x] 3.5 Write tests for TimestampMappingWorker
    - Test happy path: worker maps timestamps and transitions to direction_generation
    - Test failure: mapper returns error, worker marks job as failed
    - _Requirements: 4.1, 4.7_

- [x] 4. Backend infrastructure — update existing workers and services
  - [x] 4.1 Update ScriptGenerator interface and AI implementation
    - Update `apps/api/src/pipeline/application/interfaces/script-generator.ts`:
      - Change return type from `Result<string, PipelineError>` to `Result<ScriptGenerationResult, PipelineError>`
      - Define `ScriptGenerationResult` as `{ script: string; scenes: SceneBoundary[] }`
    - Update `apps/api/src/pipeline/infrastructure/services/ai-script-generator.ts`:
      - Switch from `generateText` to `generateObject` with `structuredScriptResponseSchema`
      - Update system prompt to instruct the AI to produce named scene blocks with types
      - Set `startTime: 0` and `endTime: 0` on all scene boundaries
      - Validate scene count (2–15), scene types, and text coverage
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.2 Update ScriptGenerationWorker
    - Update `apps/api/src/pipeline/infrastructure/queue/workers/script-generation.worker.ts`:
      - Destructure `{ script, scenes }` from generator result
      - Call `pipelineJob.setScript(script, scenes)` instead of `pipelineJob.setScript(script)`
    - Update worker tests accordingly
    - _Requirements: 1.1, 2.1_

  - [x] 4.3 Update TTS generation worker
    - Update `apps/api/src/pipeline/infrastructure/queue/workers/tts-generation.worker.ts`:
      - Change enqueue target from `scene_planning` to `timestamp_mapping`
      - Update transition: `transcription` → `timestamp_mapping` (instead of `scene_planning`)
    - Update worker tests accordingly
    - _Requirements: 3.4_

  - [x] 4.4 Update pipeline queue configuration
    - Update `apps/api/src/pipeline/infrastructure/queue/pipeline-queue.ts`:
      - Remove `scene_planning` from `STAGE_RETRY_CONFIG` and `ProcessingStage` type
      - Add `timestamp_mapping` with retry config: `{ attempts: 1, backoff: { type: "exponential", delay: 1000 } }`
      - Remove `scene_plan_review` from `NON_PROCESSING_STAGES`
    - _Requirements: 3.1, 3.5_

- [x] 5. Backend application — update use cases
  - [x] 5.1 Update ApproveScriptUseCase
    - Update `apps/api/src/pipeline/application/use-cases/approve-script.use-case.ts`:
      - Accept optional `scenes: SceneBoundary[]` in request
      - Call `pipelineJob.setApprovedScript(script, scenes)` with both script and scenes
      - If no scenes provided, use `pipelineJob.generatedScenes`
    - Update tests accordingly
    - _Requirements: 2.3, 2.4_

  - [x] 5.2 Update RegenerateScriptUseCase
    - Update `apps/api/src/pipeline/application/use-cases/regenerate-script.use-case.ts`:
      - Clear `generatedScenes` and `approvedScenes` alongside `generatedScript`
    - Update tests accordingly
    - _Requirements: 2.5_

  - [x] 5.3 Update GetJobStatusUseCase
    - Update `apps/api/src/pipeline/application/use-cases/get-job-status.use-case.ts`:
      - Include `generatedScenes` and `approvedScenes` in the DTO mapping
    - _Requirements: 5.3_

  - [x] 5.4 Remove obsolete use cases
    - Delete `apps/api/src/pipeline/application/use-cases/approve-scene-plan.use-case.ts`
    - Delete `apps/api/src/pipeline/application/use-cases/regenerate-scene-plan.use-case.ts`
    - Delete associated test files
    - _Requirements: 6.2_

- [x] 6. Backend infrastructure — remove obsolete components
  - [x] 6.1 Remove scene planning worker and service
    - Delete `apps/api/src/pipeline/infrastructure/queue/workers/scene-planning.worker.ts` and its test file
    - Delete `apps/api/src/pipeline/infrastructure/services/ai-scene-planner.ts`
    - Delete `apps/api/src/pipeline/application/interfaces/scene-planner.ts`
    - _Requirements: 6.1, 6.5_

  - [x] 6.2 Update worker registry
    - Update `apps/api/src/pipeline/infrastructure/queue/worker-registry.ts`:
      - Remove `ScenePlanningWorker` registration
      - Add `TimestampMappingWorker` registration with `TimestampMapper` dependency
    - _Requirements: 6.1_

  - [x] 6.3 Update pipeline controller and routes
    - Update `apps/api/src/pipeline/presentation/controllers/pipeline.controller.ts`:
      - Remove `approve-scene-plan` and `regenerate-scene-plan` endpoint handlers
      - Update `approve-script` handler to accept optional `scenes` in request body
    - Update `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts`:
      - Remove scene plan routes
    - Update `apps/api/src/pipeline/presentation/dtos/approve-script.dto.ts`:
      - Add optional `scenes` field to the approve script DTO
    - Delete `apps/api/src/pipeline/presentation/dtos/approve-scene-plan.dto.ts`
    - _Requirements: 6.3_

  - [x] 6.4 Update pipeline factory
    - Update `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`:
      - Remove `ApproveScenePlanUseCase` and `RegenerateScenePlanUseCase` wiring
      - Add `TimestampMapper` instantiation and wiring
    - _Requirements: 6.1, 6.2_

- [x] 7. Checkpoint — Ensure all backend tests pass
  - Run full backend test suite, fix any failures from the refactor

- [x] 8. Frontend — update types and repository
  - [x] 8.1 Update frontend pipeline types
    - Update `apps/web/src/features/pipeline/types/pipeline.types.ts`:
      - Reflect updated `PipelineStage` and `PipelineStatus` types from shared package
    - _Requirements: 3.1, 3.2_

  - [x] 8.2 Update frontend pipeline repository
    - Update `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`:
      - Remove `approveScenePlan()` and `regenerateScenePlan()` methods
      - Update `approveScript()` to accept optional `scenes: SceneBoundary[]`
    - Update `apps/web/src/features/pipeline/repositories/http-pipeline.repository.ts`:
      - Remove scene plan methods
      - Update approve script to send scenes in request body
    - _Requirements: 6.6_

- [x] 9. Frontend — update components
  - [x] 9.1 Update ScriptReviewEditor to use API scene data
    - Update `apps/web/src/features/pipeline/components/script-review-editor.tsx`:
      - Accept `scenes: SceneBoundary[]` prop (from `job.generatedScenes`)
      - Use API-provided scenes instead of client-side parsing when available
      - Fall back to client-side parsing if no scenes provided (backward compat)
      - On approve, pass both the reconstructed script text and the scenes array to `onApprove`
    - Update `onApprove` callback signature: `(editedScript?: string, scenes?: SceneBoundary[]) => void`
    - Update tests accordingly
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 9.2 Update JobStatusTracker
    - Update `apps/web/src/features/pipeline/components/job-status-tracker.tsx`:
      - Remove `scene_planning` and `scene_plan_review` from `STAGES` array
      - Add `timestamp_mapping` stage with label "Timestamp Map"
    - Update tests accordingly
    - _Requirements: 3.4, 3.6_

  - [x] 9.3 Update job detail page
    - Update `apps/web/src/app/jobs/[id]/page.tsx`:
      - Remove `awaiting_scene_plan_review` section (ScenePlanTimeline, ScenePlanCard, approve/regenerate buttons)
      - Remove `handleApproveScenePlan` and `handleRegenerateScenePlan` callbacks
      - Pass `job.generatedScenes` to `ScriptReviewEditor` as `scenes` prop
      - Update `handleApproveScript` to pass scenes to repository
    - _Requirements: 6.4_

  - [x] 9.4 Remove obsolete frontend components
    - Delete `apps/web/src/features/pipeline/components/scene-plan-timeline.tsx` and its test file
    - Delete `apps/web/src/features/pipeline/components/scene-plan-card.tsx` and its test file
    - Remove imports from any files that reference them
    - _Requirements: 6.4_

- [x] 10. Checkpoint — Ensure all frontend tests pass
  - Run full frontend test suite, fix any failures from the refactor

- [x] 11. Database migration
  - [x] 11.1 Create Prisma migration
    - Update `apps/api/prisma/schema.prisma`:
      - Add `generatedScenes Json?` and `approvedScenes Json?` fields to `PipelineJob`
      - Update `PipelineStage` enum: remove `scene_planning`, `scene_plan_review`; add `timestamp_mapping`
      - Update `PipelineStatus` enum: remove `awaiting_scene_plan_review`
    - Run `npx prisma migrate dev --name merge-scene-planning-into-script-gen`
    - _Requirements: 3.1, 3.2, 2.1_

- [x] 12. Final checkpoint — Full test suite
  - Run both backend and frontend test suites
  - Verify no references to removed components remain
  - Verify pipeline flow works end-to-end with the new stage sequence

## Notes

- The timestamp mapping algorithm is intentionally simple: sequential word matching. If the AI-generated scene text doesn't exactly match the TTS output (e.g., the TTS normalizes numbers or abbreviations), the mapper should use fuzzy matching with a tolerance for minor word differences.
- The `SceneBoundary` interface is unchanged — it still has `startTime` and `endTime` fields. During script generation these are `0` placeholders; after timestamp mapping they have real values. Downstream consumers only see the final timestamped version.
- Existing jobs in `scene_planning` or `scene_plan_review` stages will need manual migration or will fail gracefully. This is acceptable for a pre-production system.
- The frontend `ScriptReviewEditor` already renders scene blocks inline from the recent redesign — the main change is switching from client-side text parsing to API-provided scene data.
