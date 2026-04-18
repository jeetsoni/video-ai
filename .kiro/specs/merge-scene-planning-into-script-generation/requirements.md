# Requirements Document

## Introduction

Currently the pipeline has two separate AI stages for content structuring: **script generation** (produces a flat text script) and **scene planning** (segments the script into `SceneBoundary` objects after TTS and transcription). This creates a problem: scene boundaries depend on word-level timestamps from TTS audio, which means the user can't see the scene structure until 3 stages later. The user reviews the script blind — without knowing how it will be segmented into scenes.

This change merges scene planning into the script generation step. The AI will generate the script **already structured into named scene blocks** with types (Hook, Analogy, Bridge, etc.) and the spoken text per scene. The scene boundaries won't have real `startTime`/`endTime` values yet (those come from TTS timestamps), but the narrative structure — which scenes exist, what type they are, what text belongs to each — is decided upfront and visible during script review.

After TTS produces word-level timestamps, a lightweight **timestamp mapping** step assigns real time boundaries to the pre-defined scene blocks by matching spoken text to transcript words. No AI call needed — just text alignment. This eliminates the separate `scene_planning` stage, the `scene_plan_review` gate, and one full LLM call from the pipeline.

## Glossary

- **Structured Script**: A script output that includes both the full narration text and an array of scene blocks, each with a name, type, and the spoken text for that scene
- **Timestamp Mapping**: A deterministic (non-AI) process that takes pre-defined scene blocks (with text but no timestamps) and word-level transcript data, and assigns `startTime`/`endTime` to each scene by aligning scene text to transcript words
- **Scene Block**: A narrative segment within the structured script, identified by name, type, and spoken text — equivalent to a `SceneBoundary` but without time information until after TTS

## Requirements

### Requirement 1: Structured Script Generation

**User Story:** As a content creator, I want the AI to generate my script already organized into named scenes with types so that I can see the narrative structure during script review.

#### Acceptance Criteria

1. WHEN the Pipeline receives a validated topic prompt, THE Script_Generator SHALL produce a structured output containing both a full script string and an array of scene blocks
2. EACH scene block SHALL include: a sequential numeric `id`, a short descriptive `name`, a `type` from the set {Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA}, and a `text` field containing the spoken narration for that scene
3. THE Script_Generator SHALL produce between 2 and 15 scene blocks depending on the selected Video_Format (2–4 for reels/shorts, 3–15 for longform)
4. THE concatenation of all scene block `text` fields (in order, joined by a single space) SHALL be equivalent to the full script string after whitespace normalization
5. THE Script_Generator SHALL structure scenes with a Hook opening, educational body sections using appropriate types, and a CTA closing
6. ALL existing script generation constraints SHALL continue to apply: word count ranges per format, conversational language, retry logic (3 attempts)

### Requirement 2: Script Review with Scene Visibility

**User Story:** As a content creator, I want to see and edit the script organized by scenes during review so that I understand the narrative structure before approving.

#### Acceptance Criteria

1. WHEN the Script_Generator produces a structured script, THE Pipeline SHALL persist both the full script text and the scene blocks array in the job record
2. THE Pipeline SHALL present the script to the user during Script_Review with scene blocks visually delineated, showing each scene's name, type, and editable text
3. WHEN the user edits scene text inline, THE Pipeline SHALL reconstruct the full script string from the concatenation of all scene block texts
4. WHEN the user approves the script, THE Pipeline SHALL persist both the approved script text and the approved scene blocks (with any user edits applied)
5. THE Pipeline SHALL allow the user to request a full script regeneration during Script_Review, which regenerates both the script text and scene blocks

### Requirement 3: Pipeline Stage Simplification

**User Story:** As a system operator, I want the pipeline to have fewer stages and review gates so that video generation is faster and simpler.

#### Acceptance Criteria

1. THE Pipeline SHALL remove the `scene_planning` stage from the pipeline flow
2. THE Pipeline SHALL remove the `scene_plan_review` stage and the `awaiting_scene_plan_review` status from the pipeline flow
3. THE Pipeline SHALL remove the `scene_planning_failed` error code since scene structure is now part of script generation
4. THE new pipeline stage sequence SHALL be: `script_generation` → `script_review` → `tts_generation` → `transcription` → `timestamp_mapping` → `direction_generation` → `code_generation` → `rendering` → `done`
5. THE Pipeline SHALL add a new `timestamp_mapping` stage between `transcription` and `direction_generation`
6. THE Pipeline SHALL update progress percentages to reflect the simplified stage sequence

### Requirement 4: Timestamp Mapping

**User Story:** As the system, I need to assign real audio timestamps to the pre-defined scene blocks so that direction generation can produce time-synchronized animations.

#### Acceptance Criteria

1. WHEN word-level timestamps are available from TTS, THE Pipeline SHALL execute a deterministic timestamp mapping step that assigns `startTime` and `endTime` to each scene block
2. THE timestamp mapping SHALL align scene text to transcript words by sequential text matching — for each scene block, find the first and last transcript word that belongs to that scene's text
3. THE timestamp mapping SHALL produce contiguous scene boundaries: each scene's `endTime` SHALL equal the next scene's `startTime`, with no gaps or overlaps
4. THE first scene's `startTime` SHALL be less than or equal to the first transcript word's start time
5. THE last scene's `endTime` SHALL be greater than or equal to the last transcript word's end time
6. THE timestamp mapping SHALL NOT require an AI/LLM call — it is a deterministic text-alignment algorithm
7. IF timestamp mapping fails (e.g., scene text cannot be aligned to transcript), THE Pipeline SHALL mark the job as failed with a `timestamp_mapping_failed` error code

### Requirement 5: Backward Compatibility

**User Story:** As a developer, I want the downstream pipeline stages to continue working without changes so that direction generation, code generation, and rendering are unaffected.

#### Acceptance Criteria

1. THE scene blocks with assigned timestamps SHALL conform to the existing `SceneBoundary` interface (`id`, `name`, `type`, `startTime`, `endTime`, `text`)
2. THE Direction_Generator SHALL continue to receive `SceneBoundary` objects with valid timestamps and transcript words, unchanged from the current contract
3. THE `PipelineJobDto` SHALL continue to include `scenePlan` as `SceneBoundary[]` for frontend consumption
4. ALL existing API endpoints for job status, listing, and video retrieval SHALL continue to function without breaking changes

### Requirement 6: Removal of Obsolete Components

**User Story:** As a developer, I want obsolete scene planning components removed so that the codebase stays clean.

#### Acceptance Criteria

1. THE Pipeline SHALL remove the `ScenePlanningWorker` from the worker registry
2. THE Pipeline SHALL remove the `ApproveScenePlanUseCase` and `RegenerateScenePlanUseCase` from the application layer
3. THE Pipeline SHALL remove the `/api/pipeline/jobs/:id/approve-scene-plan` and `/api/pipeline/jobs/:id/regenerate-scene-plan` API endpoints
4. THE Pipeline SHALL remove the `ScenePlanReview` frontend components (`ScenePlanTimeline`, `ScenePlanCard`) from the job detail page rendering
5. THE Pipeline SHALL remove the `ScenePlanner` interface and `AIScenePlanner` implementation
6. THE frontend `PipelineRepository` interface SHALL remove `approveScenePlan()` and `regenerateScenePlan()` methods
