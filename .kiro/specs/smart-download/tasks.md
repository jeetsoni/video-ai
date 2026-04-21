# Implementation Plan: Smart Download

## Overview

Merge the separate "Re-render" and "Download" buttons into a single smart "Download" button. The backend persists a SHA-256 hash of `generatedCode` at render time and exposes a `codeChanged` boolean on the job status DTO. The frontend uses this flag to decide whether to download directly or trigger a re-render first, then auto-download once complete.

## Tasks

- [x] 1. Add `computeCodeHash` utility and database column
  - [x] 1.1 Create `computeCodeHash` domain service
    - Create `video-ai/apps/api/src/pipeline/domain/services/compute-code-hash.ts`
    - Implement a pure function that takes a string and returns its SHA-256 hash as a lowercase hex string using Node.js `crypto` module
    - _Requirements: 2.1, 2.2_

  - [ ]\* 1.2 Write property tests for `computeCodeHash`
    - **Property 2: Hash output format invariant** — For any non-empty string input, `computeCodeHash(input)` produces a 64-character lowercase hex string
    - **Property 3: Hash determinism** — For any string input, computing `computeCodeHash(input)` twice produces identical output
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 1.3 Add `lastRenderedCodeHash` column to Prisma schema
    - Add `lastRenderedCodeHash String?` to the `PipelineJob` model in `video-ai/apps/api/prisma/schema.prisma`
    - Run `npx prisma migrate dev --name add-last-rendered-code-hash` to generate the migration
    - _Requirements: 1.3_

- [x] 2. Extend `PipelineJob` entity and mapper
  - [x] 2.1 Add `lastRenderedCodeHash` to `PipelineJob` entity
    - Add `lastRenderedCodeHash: string | null` to `PipelineJobProps` in `video-ai/apps/api/src/pipeline/domain/entities/pipeline-job.ts`
    - Add a getter `get lastRenderedCodeHash(): string | null`
    - Add a setter method `setLastRenderedCodeHash(hash: string): void` that sets the value and updates `updatedAt`
    - Initialize to `null` in `create()` and accept it in `reconstitute()`
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Update `PipelineJobMapper` for `lastRenderedCodeHash`
    - In `video-ai/apps/api/src/pipeline/infrastructure/mappers/pipeline-job.mapper.ts`, map `lastRenderedCodeHash` in both `toDomain` (pass `record.lastRenderedCodeHash ?? null` to `reconstitute`) and `toPersistence` (include `lastRenderedCodeHash: job.lastRenderedCodeHash`)
    - _Requirements: 1.4_

  - [ ]\* 2.3 Write property test for mapper round-trip
    - **Property 1: Mapper round-trip preserves lastRenderedCodeHash** — For any valid `lastRenderedCodeHash` value (null or 64-char hex string), mapping to persistence and back to domain preserves the value
    - **Validates: Requirements 1.4**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Store hash at render completion and expose `codeChanged` in DTO
  - [x] 4.1 Update `VideoRenderingWorker` to compute and store hash
    - In `video-ai/apps/api/src/pipeline/infrastructure/queue/workers/video-rendering.worker.ts`, after `pipelineJob.setVideoPath(videoPath)` and before `pipelineJob.transitionTo("done")`, call `computeCodeHash(code)` and `pipelineJob.setLastRenderedCodeHash(codeHash)`
    - Import `computeCodeHash` from the domain service
    - _Requirements: 1.2_

  - [ ]\* 4.2 Write unit test for `VideoRenderingWorker` hash storage
    - Verify that after a successful render, the saved job has `lastRenderedCodeHash` set to the SHA-256 of the `generatedCode`
    - _Requirements: 1.2_

  - [x] 4.3 Add `codeChanged` field to `PipelineJobDto` in shared types
    - Add `codeChanged?: boolean` to the `PipelineJobDto` interface in `video-ai/packages/shared/src/types/pipeline.types.ts`
    - _Requirements: 3.1_

  - [x] 4.4 Compute `codeChanged` in `GetJobStatusUseCase`
    - In `video-ai/apps/api/src/pipeline/application/use-cases/get-job-status.use-case.ts`, update the `mapToDto` function to compute and include `codeChanged` when stage is "preview" or "done"
    - If `generatedCode` is null → `codeChanged = false`; if `lastRenderedCodeHash` is null → `codeChanged = true`; otherwise compare `computeCodeHash(generatedCode)` with `lastRenderedCodeHash`
    - Import `computeCodeHash` from the domain service
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]\* 4.5 Write property test for `codeChanged` computation
    - **Property 4: codeChanged computation correctness** — For any `generatedCode` string and any `lastRenderedCodeHash` value (including null): null code → false; null hash with code → true; otherwise equals `computeCodeHash(generatedCode) !== lastRenderedCodeHash`
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]\* 4.6 Write unit tests for `GetJobStatusUseCase` codeChanged field
    - Test that `codeChanged` is present when stage is "preview" or "done" and absent for other stages
    - Test `codeChanged = false` when `generatedCode` is null
    - Test `codeChanged = true` when `lastRenderedCodeHash` is null but `generatedCode` exists
    - Test `codeChanged = false` when hashes match
    - Test `codeChanged = true` when hashes differ (e.g., after a tweak)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.1_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `SmartDownloadButton` frontend component
  - [x] 6.1 Create `SmartDownloadButton` component
    - Create `video-ai/apps/web/src/features/pipeline/components/smart-download-button.tsx`
    - Accept props: `job: PipelineJobDto`, `onExport: () => void`
    - Implement behavior matrix: stage "preview" → "Download" with render indicator, calls `onExport`; stage "done" + `codeChanged=false` → "Download", triggers direct browser download via blob fetch with fallback to `window.open`; stage "done" + `codeChanged=true` → "Download" with render indicator, calls `onExport`; stage "rendering" → "Rendering…" disabled with spinner
    - Use existing Button component and Lucide icons (Download, Loader2, RefreshCw)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]\* 6.2 Write unit tests for `SmartDownloadButton`
    - Test each stage/codeChanged combination renders correct label, indicator, and disabled state
    - Test click handlers call the correct action (direct download vs onExport)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Integrate smart download into `VideoPreviewPage`
  - [x] 7.1 Replace existing buttons with `SmartDownloadButton`
    - In `video-ai/apps/web/src/features/pipeline/components/video-preview-page.tsx`, remove the separate "Export" button (preview stage), "Download" button (done stage), and "Re-render" button (done stage) from the action buttons area
    - Import and render `<SmartDownloadButton job={job} onExport={onExport} />` in their place for preview/rendering/done stages
    - Keep the "Regenerate" button as-is (it serves a different purpose)
    - _Requirements: 4.5, 4.1, 4.2, 4.3, 4.4_

  - [x] 7.2 Add auto-download after render completes
    - Add a `pendingDownloadRef` (`useRef<boolean>(false)`) to `VideoPreviewPage`
    - Set `pendingDownloadRef.current = true` when `SmartDownloadButton` triggers an export (wrap `onExport` to set the ref before calling)
    - Add an effect that watches `job.stage` — when it transitions to "done" with a `videoUrl` and `pendingDownloadRef.current` is true, auto-download the video via blob fetch and reset the ref
    - If the job transitions to "failed", reset the ref without downloading
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]\* 7.3 Write unit tests for auto-download behavior
    - Test that auto-download triggers when render completes after smart download button initiated export
    - Test that auto-download does NOT trigger on page load when job is already "done"
    - Test that auto-download does NOT trigger when render fails
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation tasks use TypeScript
