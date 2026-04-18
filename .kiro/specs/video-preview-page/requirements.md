# Requirements Document

## Introduction

This document defines the requirements for the Video Preview Page feature. After a user approves their script in the Script Review Editor, the pipeline generates a video through multiple backend stages. This feature replaces the generic post-approval UI with a dedicated Video Preview Page that shows stage-aware progress during generation and transitions into a full video player upon completion.

## Glossary

- **VideoPreviewPage**: The top-level React component rendered at `/jobs/[id]` once the job moves past the `script_review` stage.
- **StageProgressHeader**: A component that displays the current pipeline stage as a heading with an animated progress indicator.
- **VideoPreviewSection**: The central area that renders either a loading skeleton, a video player, or an error state depending on job status.
- **StageTimeline**: A visual timeline component showing all pipeline stages with their completion status.
- **VideoMetadata**: A component displaying metadata about the video (topic, format, theme, creation date).
- **PipelineJobDto**: The existing shared data transfer object containing all job fields (id, topic, format, status, stage, progressPercent, videoUrl, etc.).
- **PipelineStage**: An enumeration of pipeline processing stages: `script_generation`, `script_review`, `tts_generation`, `transcription`, `timestamp_mapping`, `direction_generation`, `code_generation`, `rendering`, `done`.
- **PipelineStatus**: An enumeration of job statuses: `pending`, `processing`, `awaiting_script_review`, `completed`, `failed`.
- **StageDisplayInfo**: A frontend-only mapping that associates each PipelineStage with a user-friendly label, description, and icon.
- **JobDetailPage**: The existing Next.js page at `/jobs/[id]` that currently renders the script review editor and a generic status tracker.

## Requirements

### Requirement 1: Route to Video Preview Page After Script Approval

**User Story:** As a user, I want to be automatically shown the Video Preview Page after approving my script, so that I can monitor the video generation progress without navigating manually.

#### Acceptance Criteria

1. WHEN the PipelineJobDto stage is past `script_review`, THE JobDetailPage SHALL render the VideoPreviewPage component instead of the generic status tracker.
2. WHEN the user approves a script in the ScriptReviewEditor, THE JobDetailPage SHALL refetch the job data and transition to the VideoPreviewPage once the stage advances.
3. THE VideoPreviewPage SHALL receive the current PipelineJobDto and a retry callback as props.

### Requirement 2: Stage-Aware Progress Display

**User Story:** As a user, I want to see which pipeline stage my video is currently in with a clear progress indicator, so that I understand how far along the generation process is.

#### Acceptance Criteria

1. THE StageProgressHeader SHALL map each PipelineStage value to a user-friendly label and description.
2. WHEN the job is processing, THE StageProgressHeader SHALL display an animated progress bar reflecting the current `progressPercent` value.
3. WHEN the job completes, THE StageProgressHeader SHALL display a success state.
4. THE StageDisplayInfo mapping SHALL contain an entry for every PipelineStage enum value.

### Requirement 3: Stage Timeline Visualization

**User Story:** As a user, I want to see a timeline of all pipeline stages with their completion status, so that I can understand the full generation workflow and where my video is in the process.

#### Acceptance Criteria

1. THE StageTimeline SHALL render a node for each pipeline stage in sequential order.
2. THE StageTimeline SHALL visually distinguish completed, active, pending, and failed stages.
3. WHEN the job stage advances, THE StageTimeline SHALL animate the transition between stages.
4. WHEN the job status is `failed`, THE StageTimeline SHALL mark the current stage as failed and all subsequent stages as pending.

### Requirement 4: Video Preview Section State Management

**User Story:** As a user, I want the central preview area to show the appropriate content based on the current job status, so that I always see relevant information whether the video is processing, ready, or failed.

#### Acceptance Criteria

1. WHILE the job status is `processing`, THE VideoPreviewSection SHALL render a skeleton placeholder in the correct aspect ratio matching the job format (9:16 for reel, 16:9 for longform).
2. WHEN the job status is `completed` and a `videoUrl` is present, THE VideoPreviewSection SHALL render an HTML5 video player with playback controls.
3. WHEN the job status is `failed`, THE VideoPreviewSection SHALL render an error card displaying the error message and a "Retry" button.
4. WHEN the user clicks the "Retry" button on the error card, THE VideoPreviewSection SHALL invoke the retry callback to restart the pipeline.

### Requirement 5: Video Metadata Display

**User Story:** As a user, I want to see metadata about my video (topic, format, theme, creation date), so that I can confirm the details of the video being generated.

#### Acceptance Criteria

1. THE VideoMetadata SHALL display the video topic, format badge, theme name, and creation date.
2. WHEN the job status is `completed`, THE VideoMetadata SHALL display a download button for the video.

### Requirement 6: Polling and Real-Time Updates

**User Story:** As a user, I want the page to automatically update with the latest job status, so that I see progress in real time without manually refreshing.

#### Acceptance Criteria

1. THE VideoPreviewPage SHALL poll the backend API for updated job data at a regular interval.
2. WHEN updated job data is received, THE VideoPreviewPage SHALL update all child components (StageProgressHeader, StageTimeline, VideoPreviewSection) with the new data.
3. WHEN the job reaches `completed` status, THE VideoPreviewPage SHALL stop polling and transition to the video player view.

### Requirement 7: Pipeline Failure Handling

**User Story:** As a user, I want clear error information and recovery options when the video generation fails, so that I can understand what went wrong and try again.

#### Acceptance Criteria

1. WHEN the backend returns a PipelineJobDto with `status` equal to `failed`, THE VideoPreviewPage SHALL display the `errorMessage` from the response.
2. WHEN the user clicks "Retry" on the error state, THE VideoPreviewPage SHALL call the regenerate-script endpoint and navigate back to restart the pipeline flow.
3. IF the job reaches `completed` status but `videoUrl` is undefined, THEN THE VideoPreviewPage SHALL display a fallback message indicating the video file is not yet available.
4. IF the `videoUrl` does not appear after continued polling, THEN THE VideoPreviewPage SHALL display a "Contact Support" option.

### Requirement 8: Polling Network Error Resilience

**User Story:** As a user, I want the page to handle network errors gracefully during polling, so that temporary connectivity issues do not disrupt my experience.

#### Acceptance Criteria

1. IF a polling request fails due to a network error, THEN THE VideoPreviewPage SHALL display a transient error banner without losing the current progress display.
2. WHEN a polling request fails, THE VideoPreviewPage SHALL automatically retry on the next polling interval.
3. THE VideoPreviewPage SHALL provide a manual "Refresh" button for the user to trigger an immediate re-fetch.

### Requirement 9: Progress Bar Accuracy

**User Story:** As a user, I want the progress bar to accurately reflect the generation progress, so that I have a reliable sense of how much longer the process will take.

#### Acceptance Criteria

1. THE StageProgressHeader progress bar width SHALL be proportional to the `progressPercent` value from the PipelineJobDto.
2. THE `progressPercent` value SHALL be clamped between 0 and 100 inclusive for display purposes.
