# Requirements Document

## Introduction

Replace the current server-side Remotion video rendering pipeline with a client-side preview using `@remotion/player`. Today, after code generation the pipeline immediately renders an MP4 server-side via `@remotion/bundler` + `@remotion/renderer`, uploads it, and displays it as an HTML5 `<video>`. The new flow skips server-side rendering for preview: after code generation the frontend fetches the generated React component code, scene plan, and audio signed URL, then uses `@remotion/player` to play the animation in real-time in the browser. Server-side MP4 rendering is deferred to an explicit "Export" action.

## Glossary

- **Pipeline**: The backend BullMQ-based job processing system that orchestrates video creation stages
- **Pipeline_Job**: The domain entity tracking a single video creation request through all stages
- **Code_Generation_Worker**: The BullMQ worker that invokes the AI code generator and stores the resulting React component code
- **Remotion_Player**: The `@remotion/player` React component that plays Remotion compositions in the browser without server-side rendering
- **Component_Code**: The AI-generated React component source code (`function Main({ scenePlan })`) that uses Remotion primitives
- **Scene_Plan**: The JSON object describing scenes, beats, timing, and design system tokens consumed by the generated component
- **Preview_Stage**: The new pipeline stage (`preview`) that replaces `rendering` in the default flow, indicating the job is ready for client-side preview
- **Export**: The user-initiated action that triggers server-side MP4 rendering of a previewed job
- **Code_Evaluator**: The client-side module responsible for dynamically evaluating Component_Code into a live React component
- **Video_Preview_Page**: The Next.js page component (`/jobs/[id]`) that displays pipeline progress and the video preview
- **Stage_Display_Map**: The frontend mapping of pipeline stages to labels, descriptions, and icons
- **Object_Store**: The MinIO/S3 storage service used for audio files, generated code, and rendered videos

## Requirements

### Requirement 1: Pipeline Stage Transition After Code Generation

**User Story:** As a user, I want the pipeline to transition to a preview-ready state after code generation completes, so that I can see my animation immediately without waiting for server-side rendering.

#### Acceptance Criteria

1. WHEN the Code_Generation_Worker completes successfully, THE Pipeline_Job SHALL transition to the Preview_Stage instead of the `rendering` stage
2. WHEN the Pipeline_Job transitions to the Preview_Stage, THE Pipeline_Job SHALL set its status to `completed` and progress to 100%
3. THE Pipeline_Job SHALL retain the `rendering` stage as a valid transition target from the Preview_Stage to support the Export flow
4. WHEN the Pipeline_Job is in the Preview_Stage, THE Pipeline_Job SHALL have its `generatedCode`, `codePath`, `sceneDirections`, `audioPath`, and `transcript` fields populated

### Requirement 2: Preview Data API Endpoint

**User Story:** As a frontend client, I want to fetch the generated component code, scene plan, and audio URL for a job, so that I can render the animation client-side.

#### Acceptance Criteria

1. WHEN the Pipeline_Job is in the Preview_Stage, THE API SHALL expose an endpoint that returns the Component_Code as a string
2. WHEN the Pipeline_Job is in the Preview_Stage, THE API SHALL return the Scene_Plan JSON object in the response
3. WHEN the Pipeline_Job is in the Preview_Stage, THE API SHALL return a signed URL for the voiceover audio file from the Object_Store
4. WHEN the Pipeline_Job is in the Preview_Stage, THE API SHALL return the video format, fps (30), and total frame count
5. IF the Pipeline_Job is not in the Preview_Stage, THEN THE API SHALL return a 404 or appropriate error indicating preview data is not yet available
6. IF the audio signed URL generation fails, THEN THE API SHALL return the remaining preview data with a null audio URL and an error flag

### Requirement 3: Client-Side Code Evaluation

**User Story:** As a frontend developer, I want to safely evaluate the AI-generated React component code in the browser, so that it can be used as a Remotion composition.

#### Acceptance Criteria

1. WHEN the Code_Evaluator receives valid Component_Code, THE Code_Evaluator SHALL produce a React component that accepts a `scenePlan` prop
2. WHEN the Component_Code references Remotion primitives (AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing), THE Code_Evaluator SHALL provide these as globals available to the evaluated code
3. WHEN the Component_Code references React APIs (useState, useEffect, useMemo, useCallback), THE Code_Evaluator SHALL provide these as globals available to the evaluated code
4. IF the Component_Code contains syntax errors, THEN THE Code_Evaluator SHALL return a descriptive error message including the error location
5. IF the Component_Code does not export or define a `Main` function, THEN THE Code_Evaluator SHALL return an error indicating the missing component
6. THE Code_Evaluator SHALL evaluate code using `new Function()` constructor with an explicit allow-list of globals — no `eval()` or `<script>` injection

### Requirement 4: Remotion Player Integration

**User Story:** As a user, I want to see my generated animation playing in real-time in the browser, so that I can preview it instantly without waiting for rendering.

#### Acceptance Criteria

1. WHEN the Pipeline_Job reaches the Preview_Stage, THE Video_Preview_Page SHALL render a Remotion_Player instance displaying the animation
2. THE Remotion_Player SHALL receive the evaluated Component_Code as its component, the Scene_Plan as `inputProps`, and the correct `durationInFrames`, `fps`, `compositionWidth`, and `compositionHeight` derived from the job's video format
3. THE Remotion_Player SHALL play the voiceover audio in sync with the animation using the signed audio URL
4. THE Remotion_Player SHALL provide playback controls: play/pause, seek bar, and current time display
5. WHILE the preview data is being fetched, THE Video_Preview_Page SHALL display a loading skeleton matching the video aspect ratio
6. IF the Code_Evaluator returns an error, THEN THE Video_Preview_Page SHALL display the error message with a "Retry" button that re-fetches the preview data

### Requirement 5: Stage Display Map Update

**User Story:** As a user, I want to see accurate progress information for the new preview stage, so that I understand where my video is in the pipeline.

#### Acceptance Criteria

1. THE Stage_Display_Map SHALL include a `preview` entry with a label of "Preview", a description of "Animation ready for preview", and an appropriate icon
2. WHEN the Pipeline_Job is in the Preview_Stage, THE Stage_Progress_Header SHALL display 100% progress
3. THE Stage_Timeline SHALL render the Preview_Stage between `code_generation` and `done` in the visual stage list

### Requirement 6: Export to MP4

**User Story:** As a user, I want to explicitly trigger server-side rendering to produce a downloadable MP4, so that I can export my video only when I'm satisfied with the preview.

#### Acceptance Criteria

1. WHEN the Pipeline_Job is in the Preview_Stage, THE Video_Preview_Page SHALL display an "Export" button
2. WHEN the user clicks the "Export" button, THE API SHALL transition the Pipeline_Job from the Preview_Stage to the `rendering` stage and enqueue the rendering job
3. WHILE the Pipeline_Job is in the `rendering` stage after an export request, THE Video_Preview_Page SHALL display a rendering progress indicator alongside the Remotion_Player preview
4. WHEN the rendering completes and the Pipeline_Job transitions to `done`, THE Video_Preview_Page SHALL display a download link for the rendered MP4
5. IF the export rendering fails, THEN THE Video_Preview_Page SHALL display the error message and an option to retry the export without losing the preview

### Requirement 7: Backward Compatibility

**User Story:** As a system operator, I want the existing rendering pipeline to remain functional for the export flow, so that no existing capability is lost.

#### Acceptance Criteria

1. THE Video_Rendering_Worker SHALL continue to function for jobs that transition from the Preview_Stage to the `rendering` stage via export
2. THE Remotion_Video_Renderer SHALL continue to bundle and render Component_Code server-side when invoked by the Video_Rendering_Worker
3. WHEN a Pipeline_Job reaches `done` via the export flow, THE Pipeline_Job SHALL have a valid `videoPath` and `videoUrl` as in the current system

### Requirement 8: PipelineStage and PipelineStatus Type Updates

**User Story:** As a developer, I want the shared type definitions to include the new preview stage, so that both frontend and backend have consistent type safety.

#### Acceptance Criteria

1. THE `PipelineStage` type in `@video-ai/shared` SHALL include `"preview"` as a valid stage value
2. THE `PipelineStage` value object SHALL define valid transitions: `code_generation → preview`, `preview → rendering`, and `preview → done`
3. THE `STAGES_IN_ORDER` array SHALL place `"preview"` between `"code_generation"` and `"rendering"`
4. THE `STAGE_TO_PROGRESS` mapping SHALL assign `preview` a progress value of 95 and `done` SHALL remain at 100
