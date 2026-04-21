# Requirements Document

## Introduction

Merge the separate "Re-render" and "Download" buttons on the job detail page into a single smart "Download" button. The button detects whether the generated code has changed since the last render and either downloads the existing video directly or triggers a re-render first, then downloads once complete. This simplifies the user experience by removing the need to manually decide when to re-render.

## Glossary

- **Smart_Download_Button**: The unified UI button that replaces the separate "Download" and "Re-render" buttons on the video preview page.
- **Code_Hash**: A SHA-256 hash of the `generatedCode` field, used to detect whether the code has changed since the last render.
- **Last_Rendered_Code_Hash**: A persisted hash of the `generatedCode` that was used for the most recent successful video render.
- **Code_Changed**: A boolean flag derived by comparing the current Code_Hash against the Last_Rendered_Code_Hash. True when the hashes differ or when Last_Rendered_Code_Hash is null.
- **Pipeline_Job**: The domain entity representing a video generation pipeline job, tracked through stages from script generation to final rendered video.
- **Export_Use_Case**: The backend use case responsible for transitioning a Pipeline_Job to the "rendering" stage and enqueuing the rendering worker.
- **Video_Rendering_Worker**: The backend worker that renders the video from generated code and transitions the Pipeline_Job to the "done" stage.
- **Job_Status_DTO**: The data transfer object (`PipelineJobDto`) returned by the GET `/api/pipeline/jobs/:id` endpoint, consumed by the frontend for display and decision-making.

## Requirements

### Requirement 1: Persist Last Rendered Code Hash

**User Story:** As a developer, I want the system to track which version of the code was last rendered, so that the frontend can determine whether a re-render is needed.

#### Acceptance Criteria

1. THE Pipeline_Job entity SHALL expose a `lastRenderedCodeHash` property of type `string | null`, defaulting to null for new jobs.
2. WHEN the Video_Rendering_Worker successfully completes rendering and transitions the Pipeline_Job to the "done" stage, THE Video_Rendering_Worker SHALL compute the Code_Hash of the current `generatedCode` and store it as the `lastRenderedCodeHash` on the Pipeline_Job before saving.
3. THE database schema SHALL include a `lastRenderedCodeHash` column of type `String?` on the `PipelineJob` model.
4. WHEN a Pipeline_Job is reconstituted from the database, THE Pipeline_Job entity SHALL include the persisted `lastRenderedCodeHash` value.

### Requirement 2: Compute Code Hash Deterministically

**User Story:** As a developer, I want code hashing to be deterministic and consistent, so that identical code always produces the same hash regardless of when or where it is computed.

#### Acceptance Criteria

1. THE Code_Hash computation SHALL use the SHA-256 algorithm on the raw `generatedCode` string.
2. THE Code_Hash computation SHALL produce a lowercase hexadecimal string.
3. FOR ALL valid `generatedCode` strings, computing the Code_Hash twice on the same input SHALL produce identical output (determinism round-trip property).

### Requirement 3: Expose Code Changed Flag in Job Status DTO

**User Story:** As a frontend developer, I want the job status API to tell me whether the code has changed since the last render, so that the smart download button can decide its behavior without computing hashes client-side.

#### Acceptance Criteria

1. THE Job_Status_DTO SHALL include a `codeChanged` field of type `boolean` when the Pipeline_Job stage is "preview" or "done".
2. WHEN the `lastRenderedCodeHash` is null, THE `codeChanged` field SHALL be true.
3. WHEN the `lastRenderedCodeHash` is not null, THE `codeChanged` field SHALL be true if the current Code_Hash of `generatedCode` differs from `lastRenderedCodeHash`, and false if they match.
4. WHEN the Pipeline_Job has no `generatedCode`, THE `codeChanged` field SHALL be false.

### Requirement 4: Unified Smart Download Button

**User Story:** As a user, I want a single "Download" button instead of separate "Download" and "Re-render" buttons, so that I can get my video with one click without worrying about whether I need to re-render first.

#### Acceptance Criteria

1. WHEN the Pipeline_Job stage is "done" and `codeChanged` is false, THE Smart_Download_Button SHALL display "Download" and trigger a direct browser download of the video file on click.
2. WHEN the Pipeline_Job stage is "done" and `codeChanged` is true, THE Smart_Download_Button SHALL display "Download" with a visual indicator (subtitle or icon) that a re-render will occur, and on click SHALL trigger the Export_Use_Case to start rendering.
3. WHEN the Pipeline_Job stage is "preview", THE Smart_Download_Button SHALL display "Download" with a visual indicator that rendering is required, and on click SHALL trigger the Export_Use_Case to start rendering.
4. WHEN the Pipeline_Job stage is "rendering", THE Smart_Download_Button SHALL display "Rendering…" in a disabled state with a loading spinner.
5. THE video preview page SHALL NOT display a separate "Re-render" button when the Pipeline_Job stage is "done".

### Requirement 5: Auto-Download After Render Completes

**User Story:** As a user, I want the video to download automatically after a re-render triggered by the smart download button, so that I do not have to click download a second time.

#### Acceptance Criteria

1. WHEN the Smart_Download_Button triggers a re-render and the Pipeline_Job transitions from "rendering" to "done" with a `videoUrl`, THE frontend SHALL automatically initiate a browser download of the video file.
2. IF the re-render fails (Pipeline_Job status becomes "failed"), THEN THE frontend SHALL display the error state and SHALL NOT attempt a download.
3. THE auto-download SHALL only occur when the render was initiated by the Smart_Download_Button during the current session, not on page load when the job is already in "done" stage.

### Requirement 6: Code Change Detection After Tweak Modifications

**User Story:** As a user, I want the download button to reflect that I need a re-render after tweaking the code via the chat panel, so that I always get a video that matches my latest changes.

#### Acceptance Criteria

1. WHEN the user sends a tweak message that modifies the `generatedCode`, THE `codeChanged` flag SHALL update to true on the next job status poll.
2. WHEN the user sends a tweak message that modifies the `generatedCode` and the Pipeline_Job stage is "done", THE Smart_Download_Button SHALL update its display to indicate a re-render is needed.
