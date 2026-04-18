# Implementation Plan: Client-Side Remotion Preview

## Overview

Replace the automatic server-side Remotion rendering step with a client-side `@remotion/player` preview. After code generation, the pipeline transitions to a new `preview` stage. The frontend fetches the generated code, scene plan, and audio URL, evaluates the code in-browser, and plays it via `@remotion/player`. Server-side MP4 rendering is deferred to an explicit "Export" action.

## Tasks

- [x] 1. Add `preview` to PipelineStage type and update stage transitions
  - [x] 1.1 Add `"preview"` to the `PipelineStage` type union in `packages/shared/src/types/pipeline.types.ts`
    - Insert `"preview"` between `"code_generation"` and `"rendering"` in the union
    - _Requirements: 8.1_
  - [x] 1.2 Add `preview` to the Prisma `PipelineStage` enum and create a migration
    - Add `preview` between `code_generation` and `rendering` in `apps/api/prisma/schema.prisma`
    - Run `npx prisma migrate dev --name add-preview-stage`
    - _Requirements: 8.1_
  - [x] 1.3 Update `PipelineStage` value object in `apps/api/src/pipeline/domain/value-objects/pipeline-stage.ts`
    - Add `"preview"` to `STAGES_IN_ORDER` between `"code_generation"` and `"rendering"`
    - Update `VALID_TRANSITIONS`: change `code_generation → ["rendering"]` to `code_generation → ["preview"]`, add `preview → ["rendering", "done"]`
    - _Requirements: 8.2, 8.3_
  - [x] 1.4 Update `PipelineJob` entity in `apps/api/src/pipeline/domain/entities/pipeline-job.ts`
    - Add `preview: PipelineStatus.completed()` to `STAGE_TO_STATUS`
    - Add `preview: 95` to `STAGE_TO_PROGRESS`
    - _Requirements: 1.1, 1.2, 8.4_

- [x] 2. Update CodeGenerationWorker to transition to `preview`
  - [x] 2.1 Modify `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`
    - Change `pipelineJob.transitionTo("rendering")` to `pipelineJob.transitionTo("preview")`
    - Remove the `await this.queueService.enqueue({ stage: "rendering", jobId })` call
    - _Requirements: 1.1, 1.4_
  - [ ]* 2.2 Write property test: Pipeline transition to preview sets correct state (Property 1)
    - **Property 1: Pipeline transition to preview sets correct state**
    - Generate PipelineJob at `code_generation` stage with `generatedCode` and `codePath` set, transition to next stage, verify stage = `preview`, status = `completed`, progress = 95%
    - **Validates: Requirements 1.1, 1.2**
  - [ ]* 2.3 Write property test: Preview stage data invariant (Property 2)
    - **Property 2: Preview stage data invariant**
    - Generate random PipelineJob instances at `preview` stage, verify `generatedCode`, `codePath`, `sceneDirections`, `audioPath`, and `transcript` are all non-null
    - **Validates: Requirements 1.4**
  - [ ]* 2.4 Write property test: Stage transition validity for preview (Property 7)
    - **Property 7: Stage transition validity for preview**
    - Test `canTransitionTo("preview")` returns `true` only from `code_generation`; from `preview`, `canTransitionTo` returns `true` for `rendering` and `done`, `false` for all others
    - **Validates: Requirements 1.3, 8.2**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement backend preview and export endpoints
  - [x] 4.1 Create `GetPreviewDataUseCase` in `apps/api/src/pipeline/application/use-cases/get-preview-data.use-case.ts`
    - Implement `UseCase<{ jobId: string }, Result<PreviewDataResponse, ValidationError>>`
    - Load job, validate stage is `preview`, `rendering`, or `done`
    - Reconstruct `ScenePlan` from `sceneDirections`, `transcript`, `topic`, `themeId` (same logic as `VideoRenderingWorker`)
    - Generate signed URL for audio file via `ObjectStore.getSignedUrl`
    - Return `{ code, scenePlan, audioUrl, audioError, format, fps, totalFrames, compositionWidth, compositionHeight }`
    - Return 404 if job not found or not in valid stage
    - Handle audio URL failure gracefully: set `audioUrl: null`, `audioError: true`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 4.2 Create `ExportVideoUseCase` in `apps/api/src/pipeline/application/use-cases/export-video.use-case.ts`
    - Implement `UseCase<{ jobId: string }, Result<void, ValidationError>>`
    - Load job, validate stage is `preview`
    - Call `pipelineJob.transitionTo("rendering")`, save, enqueue `{ stage: "rendering", jobId }`
    - Return 400 if job not in `preview` stage
    - _Requirements: 6.2, 7.1_
  - [x] 4.3 Add `getPreviewData` and `exportVideo` handlers to `PipelineController`
    - Add `getPreviewData(req, res)` handler: extract `id` from params, call `GetPreviewDataUseCase`, return result
    - Add `exportVideo(req, res)` handler: extract `id` from params, call `ExportVideoUseCase`, return `{ status: "ok" }`
    - Wire new use cases into the controller constructor
    - _Requirements: 2.1, 6.2_
  - [x] 4.4 Register new routes in `apps/api/src/pipeline/presentation/routes/pipeline.routes.ts`
    - Add `GET /jobs/:id/preview` → `controller.getPreviewData`
    - Add `POST /jobs/:id/export` → `controller.exportVideo`
    - _Requirements: 2.1, 6.2_
  - [x] 4.5 Wire new use cases in `apps/api/src/pipeline/presentation/factories/pipeline.factory.ts`
    - Instantiate `GetPreviewDataUseCase` with repository and objectStore
    - Instantiate `ExportVideoUseCase` with repository and queueService
    - Pass both to `PipelineController` constructor
    - _Requirements: 2.1, 6.2_
  - [ ]* 4.6 Write unit tests for `GetPreviewDataUseCase`
    - Test happy path: job in `preview` stage returns correct preview data
    - Test 404: job not found or not in valid stage
    - Test audio URL failure: returns `audioUrl: null`, `audioError: true`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 4.7 Write unit tests for `ExportVideoUseCase`
    - Test happy path: transitions to `rendering` and enqueues job
    - Test 400: job not in `preview` stage
    - _Requirements: 6.2, 7.1_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend CodeEvaluator and usePreviewData hook
  - [x] 6.1 Create `CodeEvaluator` module in `apps/web/src/features/pipeline/utils/code-evaluator.ts`
    - Implement `evaluateComponentCode(code: string): EvaluationResult` returning `{ component, error }`
    - Use `new Function()` with named parameters for each allowed global
    - Allow-list: `React`, `useState`, `useEffect`, `useMemo`, `useCallback`, `AbsoluteFill`, `Sequence`, `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, `Easing`
    - Wrap code and return the `Main` reference; validate it's a function
    - Catch `SyntaxError` and extract line/column from error message
    - Return error if `Main` is not defined
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ]* 6.2 Write property test: Code evaluator produces valid component from valid code (Property 3)
    - **Property 3: Code evaluator produces valid component from valid code**
    - Generate random valid `function Main({ scenePlan }) { ... }` code strings referencing allowed globals, verify non-null component and null error
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [ ]* 6.3 Write property test: Code evaluator rejects syntax errors (Property 4)
    - **Property 4: Code evaluator rejects syntax errors with descriptive message**
    - Generate random strings with deliberate syntax errors, verify null component and non-empty error string
    - **Validates: Requirements 3.4**
  - [ ]* 6.4 Write property test: Code evaluator rejects code without Main function (Property 5)
    - **Property 5: Code evaluator rejects code without Main function**
    - Generate random valid JS functions with names ≠ Main, verify null component and missing-Main error
    - **Validates: Requirements 3.5**
  - [ ]* 6.5 Write property test: Code evaluator sandboxes disallowed globals (Property 6)
    - **Property 6: Code evaluator sandboxes disallowed globals**
    - Generate code accessing random disallowed global names (window, document, process, require, fetch, globalThis), verify those identifiers are undefined
    - **Validates: Requirements 3.6**
  - [x] 6.6 Create `usePreviewData` hook in `apps/web/src/features/pipeline/hooks/use-preview-data.ts`
    - Fetch from `GET /api/pipeline/jobs/:id/preview` when stage is `preview`, `rendering`, or `done`
    - Run `evaluateComponentCode()` on the returned code
    - Cache the evaluated component with `useMemo` to avoid re-evaluation on re-renders
    - Return `{ previewData, evaluatedComponent, isLoading, error, refetch }`
    - _Requirements: 4.1, 4.5, 4.6_
  - [x] 6.7 Add `PreviewDataResponse` type to `apps/web/src/features/pipeline/types/pipeline.types.ts`
    - Define `PreviewDataResponse` interface matching the backend response shape
    - _Requirements: 2.1_

- [x] 7. Implement RemotionPreviewPlayer and update VideoPreviewPage
  - [x] 7.1 Create `RemotionPreviewPlayer` component in `apps/web/src/features/pipeline/components/remotion-preview-player.tsx`
    - Wrap `@remotion/player`'s `Player` component
    - Create a composition wrapper that renders the evaluated `Main` component and an `<Audio>` tag for voiceover
    - Pass `durationInFrames`, `fps`, `compositionWidth`, `compositionHeight` from preview data
    - Use Player's built-in controls for play/pause, seek bar, and time display
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 7.2 Update `VideoPreviewPage` in `apps/web/src/features/pipeline/components/video-preview-page.tsx`
    - Detect when job is in `preview` stage; use `usePreviewData` to fetch and evaluate code
    - Render `RemotionPreviewPlayer` instead of `<video>` element when in preview mode
    - Show "Export" button when in `preview` stage
    - Show rendering progress indicator alongside the Player when in `rendering` stage after export
    - Show download link when in `done` stage with a `videoUrl`
    - Show loading skeleton while preview data is being fetched
    - Show error message with "Retry" button if code evaluation fails
    - _Requirements: 4.1, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 7.3 Add export handler to `apps/web/src/app/jobs/[id]/page.tsx`
    - Add `handleExport` callback that calls `POST /api/pipeline/jobs/:id/export`
    - Pass `onExport` prop to `VideoPreviewPage`
    - _Requirements: 6.1, 6.2_

- [x] 8. Update stage display map and stage timeline
  - [x] 8.1 Add `preview` entry to `STAGE_DISPLAY_MAP` in `apps/web/src/features/pipeline/utils/stage-display-map.ts`
    - Add entry with label "Preview", description "Animation ready for preview", icon `Play` from lucide-react
    - _Requirements: 5.1_
  - [x] 8.2 Update `TIMELINE_STAGES` in `apps/web/src/features/pipeline/components/stage-timeline.tsx`
    - Insert `"preview"` between `"code_generation"` and `"rendering"` in the `TIMELINE_STAGES` array
    - _Requirements: 5.3_

- [x] 9. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — no language selection needed
- The existing `VideoRenderingWorker` and `RemotionVideoRenderer` are reused unchanged for the export flow
