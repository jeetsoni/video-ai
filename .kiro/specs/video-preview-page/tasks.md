# Implementation Plan: Video Preview Page

## Overview

Replace the generic post-approval UI in the existing `/jobs/[id]` page with a dedicated Video Preview Page. The implementation introduces five new components (`VideoPreviewPage`, `StageProgressHeader`, `VideoPreviewSection`, `StageTimeline`, `VideoMetadata`) and updates the `JobDetailPage` routing logic to render the preview page when the job moves past `script_review`. All components live in `apps/web/src/features/pipeline/components/` and rely on existing shared types (`PipelineJobDto`, `PipelineStage`, `PipelineStatus`, `VideoFormat`) and the existing `usePipelineJob` polling hook.

## Tasks

- [x] 1. Create stage display mapping utility
  - Create `apps/web/src/features/pipeline/utils/stage-display-map.ts`
  - Define the `StageDisplayInfo` interface (`stage`, `label`, `description`, `icon`)
  - Create a `STAGE_DISPLAY_MAP` constant mapping every `PipelineStage` value to a `StageDisplayInfo` entry
  - Export a `getStageDisplayInfo(stage: PipelineStage): StageDisplayInfo` helper function
  - _Requirements: 2.1, 2.4_

- [x] 2. Implement StageProgressHeader component
  - [x] 2.1 Create `apps/web/src/features/pipeline/components/stage-progress-header.tsx`
    - Accept `StageProgressHeaderProps` (`stage`, `status`, `progressPercent`)
    - Use `getStageDisplayInfo` to display the current stage label and description
    - Render an animated progress bar with width proportional to `progressPercent` (clamped 0–100)
    - Show a success state when `status === "completed"`
    - _Requirements: 2.1, 2.2, 2.3, 9.1, 9.2_

  - [ ]* 2.2 Write property test: Stage display mapping completeness (Property 1)
    - **Property 1: Stage display mapping completeness**
    - For every `PipelineStage` enum value, `getStageDisplayInfo` returns a valid `StageDisplayInfo` with non-empty `label` and `description`
    - Create test in `apps/web/src/features/pipeline/utils/stage-display-map.test.ts`
    - **Validates: Requirements 2.1, 2.4**

  - [ ]* 2.3 Write property test: Progress bar proportionality (Property 2)
    - **Property 2: Progress bar proportionality with clamping**
    - For any numeric `progressPercent` (including < 0 and > 100), the rendered progress bar width is proportional to the clamped value within [0, 100]
    - Create test in `apps/web/src/features/pipeline/components/stage-progress-header.test.tsx`
    - **Validates: Requirements 2.2, 9.1, 9.2**

- [x] 3. Implement StageTimeline component
  - [x] 3.1 Create `apps/web/src/features/pipeline/components/stage-timeline.tsx`
    - Accept `StageTimelineProps` (`stage`, `status`)
    - Render a node for each pipeline stage (post-`script_review` stages: `tts_generation` through `done`)
    - Visually distinguish completed, active, pending, and failed stage states
    - Animate transitions between stages using Tailwind transition utilities
    - When `status === "failed"`, mark the current stage as failed and subsequent stages as pending
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property test: Timeline stage state correctness (Property 3)
    - **Property 3: Timeline stage state correctness**
    - For any valid `PipelineStage` and `PipelineStatus` combination, stages before the current are marked completed, the current is active (or failed), and stages after are pending
    - Create test in `apps/web/src/features/pipeline/components/stage-timeline.test.tsx`
    - **Validates: Requirements 3.2, 3.4**

- [x] 4. Implement VideoPreviewSection component
  - [x] 4.1 Create `apps/web/src/features/pipeline/components/video-preview-section.tsx`
    - Accept `VideoPreviewSectionProps` (`status`, `videoUrl`, `format`, `errorMessage`, `onRetry`)
    - When `status === "processing"`: render a skeleton placeholder with correct aspect ratio (9:16 for reel, 16:9 for longform)
    - When `status === "completed"` and `videoUrl` is present: render an HTML5 `<video>` element with controls
    - When `status === "failed"`: render an error card with the `errorMessage` and a "Retry" button that calls `onRetry`
    - When `status === "completed"` but `videoUrl` is undefined: render a fallback message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.3_

  - [ ]* 4.2 Write property test: Skeleton aspect ratio matches format (Property 5)
    - **Property 5: Skeleton aspect ratio matches video format**
    - For any `VideoFormat`, when status is `processing`, the skeleton uses the correct aspect ratio
    - Create test in `apps/web/src/features/pipeline/components/video-preview-section.test.tsx`
    - **Validates: Requirement 4.1**

  - [ ]* 4.3 Write property test: Error message display on failure (Property 6)
    - **Property 6: Error message display on failure**
    - For any `PipelineJobDto` with `status === "failed"` and any non-empty `errorMessage`, the error card contains that message and a "Retry" button
    - Add to `apps/web/src/features/pipeline/components/video-preview-section.test.tsx`
    - **Validates: Requirements 4.3, 7.1**

- [x] 5. Implement VideoMetadata component
  - [x] 5.1 Create `apps/web/src/features/pipeline/components/video-metadata.tsx`
    - Accept `VideoMetadataProps` (`topic`, `format`, `themeId`, `createdAt`, `videoUrl`)
    - Display topic, format badge, theme name (resolve from `ANIMATION_THEMES`), and formatted creation date
    - Show a download button/link when `videoUrl` is present
    - _Requirements: 5.1, 5.2_

  - [ ]* 5.2 Write property test: Metadata display completeness (Property 7)
    - **Property 7: Metadata display completeness**
    - For any valid combination of topic, format, themeId, and createdAt, all four pieces of information are rendered
    - Create test in `apps/web/src/features/pipeline/components/video-metadata.test.tsx`
    - **Validates: Requirement 5.1**

- [x] 6. Checkpoint — Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement VideoPreviewPage container component
  - [x] 7.1 Create `apps/web/src/features/pipeline/components/video-preview-page.tsx`
    - Accept `VideoPreviewPageProps` (`job: PipelineJobDto`, `onRetry: () => void`)
    - Derive visual state (processing, completed, failed) from `job.status` and `job.stage`
    - Compose `StageProgressHeader`, `VideoPreviewSection`, `StageTimeline`, and `VideoMetadata` into a cohesive layout
    - Pass relevant slices of `job` data to each child component
    - Handle the edge case where `status === "completed"` but `videoUrl` is missing (Requirement 7.3)
    - Show a transient error banner for polling errors without losing progress display (Requirement 8.1)
    - Include a manual "Refresh" button (Requirement 8.3)
    - _Requirements: 1.3, 4.1, 4.2, 4.3, 6.2, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3_

  - [ ]* 7.2 Write unit tests for VideoPreviewPage
    - Test that correct sub-components render for processing, completed, and failed states
    - Test that retry callback is wired through to VideoPreviewSection
    - Create test in `apps/web/src/features/pipeline/components/video-preview-page.test.tsx`
    - _Requirements: 1.3, 4.1, 4.2, 4.3, 7.1_

- [x] 8. Update JobDetailPage routing to render VideoPreviewPage
  - [x] 8.1 Modify `apps/web/src/app/jobs/[id]/page.tsx`
    - Import `VideoPreviewPage` component
    - Add a routing condition: when `job.stage` is past `script_review` (i.e., not `script_generation` and not `script_review`), render `VideoPreviewPage` instead of the generic `JobStatusTracker` fallback
    - Pass `job` and `handleRegenerateScript` as props to `VideoPreviewPage`
    - Ensure the `usePipelineJob` hook continues polling for non-terminal statuses so the preview page receives live updates (Requirement 6.1, 6.2)
    - Stop polling when job reaches `completed` or `failed` (Requirement 6.3)
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3_

  - [ ]* 8.2 Write property test: Routing decision based on pipeline stage (Property 4)
    - **Property 4: Routing decision based on pipeline stage**
    - For any `PipelineJobDto` where stage is past `script_review`, the routing logic selects `VideoPreviewPage`; for stages at or before `script_review`, it does not
    - Create test in `apps/web/src/app/jobs/[id]/page.test.tsx`
    - **Validates: Requirement 1.1**

  - [ ]* 8.3 Write integration tests for the full flow
    - Mock API returning progressive stage updates, verify page transitions from processing → completed with video player
    - Mock API returning failed status, verify error state renders and retry triggers navigation
    - Add to `apps/web/src/app/jobs/[id]/page.test.tsx`
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3, 7.1, 7.2_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All components use existing shared types from `@video-ai/shared` — no backend changes required
- The existing `usePipelineJob` hook already handles polling and terminal state detection
