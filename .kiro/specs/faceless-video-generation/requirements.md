# Requirements Document

## Introduction

Faceless Video Generation is the primary content pipeline for the Video AI platform. It enables creation of educational videos (reels, shorts, and longform) from a text prompt — with no face cam required. The pipeline orchestrates AI script generation with human review, ElevenLabs text-to-speech voiceover, word-level transcription, scene planning with human review, animation direction influenced by a user-selected theme, Remotion code generation, and final video rendering. The pipeline includes two human-in-the-loop checkpoints — script review and scene plan review — giving creators control over key creative decisions while automating the technical production work.

## Glossary

- **Pipeline**: The end-to-end async job chain that transforms a user prompt into a rendered video
- **Script_Generator**: The LLM-powered component that produces an educational video script from a topic prompt
- **TTS_Service**: The ElevenLabs Text-to-Speech integration that converts script text into voiceover audio
- **Transcriber**: The component that produces word-level timestamps from generated audio
- **Scene_Planner**: The AI component that segments a timestamped script into discrete scenes with types and time boundaries
- **Direction_Generator**: The AI component that produces detailed animation directions (beats, colors, motion specs, typography, SFX) for each scene
- **Code_Generator**: The AI component that produces React/Remotion component code from scene directions
- **Video_Renderer**: The Remotion-based component that renders final video output from generated components and audio
- **Job_Queue**: The BullMQ + Redis async processing system that orchestrates pipeline stages
- **Object_Store**: The MinIO/S3-compatible storage for audio files, generated code, and rendered video artifacts
- **Scene_Boundary**: A time-bounded segment of the script representing one coherent idea, with a name and scene type
- **Scene_Direction**: The full animation specification for a single scene, including beats, color accents, mood, layout, motion specs, and SFX
- **Beat**: A sub-segment within a scene direction that maps a spoken phrase to a specific visual, typography treatment, and motion animation
- **Video_Format**: The output format category — Reel (9:16, 15–60s), Short (9:16, 15–60s), or Longform (16:9, 1–10min)
- **Animation_Theme**: A named visual style preset defining a color palette, typography weights, and motion style that influences scene direction and Remotion code output
- **Script_Review**: The human-in-the-loop checkpoint where the user reviews, edits, and approves the AI-generated script before voiceover generation proceeds
- **Scene_Plan_Review**: The human-in-the-loop checkpoint where the user visualizes and approves the scene plan before direction generation proceeds

## Requirements

### Requirement 1: Pipeline Initiation

**User Story:** As a content creator, I want to provide a topic prompt, select a video format, and choose an animation theme so that the system generates a complete educational video styled to my preference.

#### Acceptance Criteria

1. WHEN a user submits a topic prompt, a Video_Format selection, and an Animation_Theme selection, THE Pipeline SHALL create a new pipeline job and return a job identifier within 2 seconds
2. THE Pipeline SHALL validate that the topic prompt contains between 3 and 500 characters before accepting the request
3. IF the topic prompt is empty or exceeds 500 characters, THEN THE Pipeline SHALL return a descriptive validation error without creating a job
4. THE Pipeline SHALL accept Video_Format values of "reel", "short", or "longform"
5. IF an unsupported Video_Format is provided, THEN THE Pipeline SHALL return a validation error listing the supported formats
6. THE Pipeline SHALL present a list of available Animation_Theme options, each displaying a name, color palette preview, and brief style description
7. THE Pipeline SHALL persist the selected Animation_Theme in the job record and pass the theme to the Direction_Generator and Code_Generator stages
8. IF no Animation_Theme is explicitly selected, THEN THE Pipeline SHALL apply a default Animation_Theme

### Requirement 2: Script Generation

**User Story:** As a content creator, I want the system to generate an educational script from my topic so that the voiceover has well-structured, engaging content.

#### Acceptance Criteria

1. WHEN the Pipeline receives a validated topic prompt, THE Script_Generator SHALL produce a structured educational script
2. THE Script_Generator SHALL tailor script length to the selected Video_Format: 50–150 words for reels, 50–150 words for shorts, and 300–2000 words for longform
3. THE Script_Generator SHALL structure the script with a hook opening, educational body sections, and a call-to-action closing
4. THE Script_Generator SHALL produce scripts using clear, conversational language suitable for voiceover narration
5. IF the Script_Generator fails to produce a script after 3 retry attempts, THEN THE Pipeline SHALL mark the job as failed with a "script_generation_failed" error code

### Requirement 3: Script Review and Approval

**User Story:** As a content creator, I want to review and edit the AI-generated script before voiceover generation so that I can ensure the content matches my intent and quality standards.

#### Acceptance Criteria

1. WHEN the Script_Generator produces a script, THE Pipeline SHALL pause execution and present the script to the user for Script_Review
2. THE Pipeline SHALL display the generated script in an editable text interface, allowing the user to modify wording, structure, and content
3. WHEN the user approves the script without edits, THE Pipeline SHALL resume execution and proceed to voiceover generation using the original script
4. WHEN the user submits an edited script, THE Pipeline SHALL validate that the edited script meets the same length constraints as the original Video_Format requirements and proceed to voiceover generation using the edited script
5. IF the user edits the script to fewer than 10 words, THEN THE Pipeline SHALL display a validation warning and prevent approval until the script meets minimum length
6. WHILE the Pipeline is paused for Script_Review, THE Pipeline SHALL persist the job status as "awaiting_script_review" and include the generated script in the job record
7. THE Pipeline SHALL allow the user to request a full script regeneration during Script_Review, restarting the Script_Generator with the original topic prompt

### Requirement 4: Voiceover Generation via ElevenLabs

**User Story:** As a content creator, I want the system to generate a natural-sounding voiceover from the script so that the video has professional audio narration.

#### Acceptance Criteria

1. WHEN a script is approved during Script_Review, THE TTS_Service SHALL send the approved script text to the ElevenLabs Text-to-Speech API and retrieve the audio output
2. THE TTS_Service SHALL store the generated audio file in the Object_Store and associate the storage path with the pipeline job
3. THE TTS_Service SHALL use a configurable ElevenLabs voice identifier for audio generation
4. IF the ElevenLabs API returns an error, THEN THE TTS_Service SHALL retry the request up to 3 times with exponential backoff
5. IF all retry attempts fail, THEN THE Pipeline SHALL mark the job as failed with a "tts_generation_failed" error code and include the ElevenLabs error message
6. THE TTS_Service SHALL produce audio in MP3 format

### Requirement 5: Audio Transcription with Word-Level Timestamps

**User Story:** As the system, I need word-level timestamps from the generated audio so that animations can be precisely synchronized to the voiceover.

#### Acceptance Criteria

1. WHEN voiceover audio is stored in the Object_Store, THE Transcriber SHALL process the audio and produce a transcript with word-level start and end timestamps
2. THE Transcriber SHALL produce timestamps with a precision of at least 10 milliseconds
3. THE Transcriber SHALL cover the entire audio duration with no gaps between the first word start and the last word end
4. IF transcription fails, THEN THE Pipeline SHALL mark the job as failed with a "transcription_failed" error code
5. FOR ALL generated transcripts, parsing the transcript into words and reconstructing the full text SHALL produce text equivalent to the original script (round-trip property)

### Requirement 6: Scene Planning

**User Story:** As the system, I need to segment the script into logical scenes so that each scene can receive targeted animation direction.

#### Acceptance Criteria

1. WHEN a word-level transcript is available, THE Scene_Planner SHALL segment the script into Scene_Boundary objects, each with an id, name, type, startTime, endTime, and spoken text
2. THE Scene_Planner SHALL assign each Scene_Boundary a type from the set: Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, or CTA
3. THE Scene_Planner SHALL produce between 2 and 15 scenes depending on the total audio duration
4. THE Scene_Planner SHALL assign every word in the transcript to exactly one scene, with no gaps and no overlaps between scene time boundaries
5. WHEN scene boundaries are produced, THE Scene_Planner SHALL validate that the first scene starts at or before the first word timestamp and the last scene ends at or after the last word timestamp
6. IF the Scene_Planner produces invalid or empty boundaries, THEN THE Pipeline SHALL retry scene planning up to 2 times before marking the job as failed with a "scene_planning_failed" error code

### Requirement 7: Scene Plan Review and Approval

**User Story:** As a content creator, I want to visualize and review the scene plan before animation direction begins so that I can verify the scene structure, types, and boundaries match my expectations.

#### Acceptance Criteria

1. WHEN the Scene_Planner produces Scene_Boundary objects, THE Pipeline SHALL pause execution and present the scene plan to the user for Scene_Plan_Review
2. THE Pipeline SHALL display each Scene_Boundary as a visual element showing the scene name, type, start time, end time, duration, and spoken text excerpt
3. THE Pipeline SHALL display the scene plan as a timeline visualization showing scene boundaries relative to the total audio duration
4. WHEN the user approves the scene plan, THE Pipeline SHALL resume execution and proceed to direction generation using the approved scene boundaries
5. WHILE the Pipeline is paused for Scene_Plan_Review, THE Pipeline SHALL persist the job status as "awaiting_scene_plan_review" and include the scene plan data in the job record
6. THE Pipeline SHALL allow the user to request scene plan regeneration during Scene_Plan_Review, restarting the Scene_Planner with the same transcript

### Requirement 8: Scene Direction Generation

**User Story:** As the system, I need detailed animation directions for each scene so that the code generator can produce rich, synchronized motion graphics.

#### Acceptance Criteria

1. WHEN Scene_Boundary objects are approved by the user, THE Direction_Generator SHALL produce a Scene_Direction for each scene containing color accent, mood, layout, and an array of Beats
2. THE Direction_Generator SHALL apply the Animation_Theme selected during pipeline initiation to influence color palette, visual style, and motion characteristics in the generated directions
3. THE Direction_Generator SHALL produce between 2 and 4 Beats per scene, each with a time range, frame range, spoken text, visual description, typography specification, motion specification, and SFX list
4. THE Direction_Generator SHALL ensure Beat time ranges within a scene cover the full scene duration with no gaps
5. THE Direction_Generator SHALL include the previous scene direction as context when generating the current scene direction, to maintain visual continuity
6. IF direction generation fails for a scene after 2 retry attempts, THEN THE Pipeline SHALL mark the job as failed with a "direction_generation_failed" error code and include the scene identifier

### Requirement 9: Remotion Code Generation

**User Story:** As the system, I need to generate React/Remotion component code from scene directions so that the video can be rendered programmatically.

#### Acceptance Criteria

1. WHEN all Scene_Direction objects are available, THE Code_Generator SHALL produce a valid React component using Remotion primitives that renders the full video
2. THE Code_Generator SHALL apply the Animation_Theme selected during pipeline initiation to influence color values, font weights, and motion styles in the generated Remotion code
3. THE Code_Generator SHALL produce code that imports only from the "remotion" package and standard React APIs
4. THE Code_Generator SHALL produce code that includes a default-exported composition component named "Main"
5. THE Code_Generator SHALL synchronize all visual animations to the word-level timestamps from the transcript
6. IF the generated code does not contain a "Main" component export, THEN THE Code_Generator SHALL retry generation up to 2 times
7. IF all retry attempts produce invalid code, THEN THE Pipeline SHALL mark the job as failed with a "code_generation_failed" error code

### Requirement 10: Video Rendering

**User Story:** As a content creator, I want the system to render the final video with animations synced to the voiceover so that I receive a polished, ready-to-publish video.

#### Acceptance Criteria

1. WHEN valid Remotion component code and voiceover audio are available, THE Video_Renderer SHALL render the final video by composing the generated animations with the audio track
2. THE Video_Renderer SHALL render reels and shorts at 1080x1920 resolution (9:16 aspect ratio) and longform videos at 1920x1080 resolution (16:9 aspect ratio)
3. THE Video_Renderer SHALL render video at 30 frames per second
4. THE Video_Renderer SHALL produce output in MP4 format with H.264 video codec and AAC audio codec
5. THE Video_Renderer SHALL store the rendered video file in the Object_Store and associate the storage path with the pipeline job
6. IF rendering fails, THEN THE Pipeline SHALL mark the job as failed with a "rendering_failed" error code and include the Remotion error output

### Requirement 11: Pipeline Job Orchestration

**User Story:** As a content creator, I want the pipeline to process my video request asynchronously with review checkpoints so that I can submit a request, review key outputs, and check back when the video is ready.

#### Acceptance Criteria

1. THE Job_Queue SHALL process pipeline stages sequentially: script generation, script review, TTS generation, transcription, scene planning, scene plan review, direction generation, code generation, and video rendering
2. THE Pipeline SHALL persist job status after each stage completion, recording the current stage, timestamps, and any intermediate artifact paths
3. WHEN a pipeline job reaches a review stage (Script_Review or Scene_Plan_Review), THE Pipeline SHALL pause processing and update the job status to the corresponding "awaiting" status until the user approves
4. WHEN a pipeline job completes all stages, THE Pipeline SHALL update the job status to "completed" and include the final video storage path
5. WHEN a pipeline job fails at any stage, THE Pipeline SHALL update the job status to "failed" and include the error code and error message
6. THE Pipeline SHALL allow querying job status by job identifier, returning the current stage, status, progress percentage, and output video path when completed
7. THE Pipeline SHALL process one pipeline stage at a time per job, advancing to the next stage only after the current stage succeeds or the user approves a review checkpoint

### Requirement 12: Pipeline Job Persistence

**User Story:** As a content creator, I want my video generation history to be saved so that I can access previously generated videos and track pipeline runs.

#### Acceptance Criteria

1. THE Pipeline SHALL persist each job record in the database with: job identifier, user-provided topic prompt, selected Video_Format, selected Animation_Theme, current status, current stage, error details, and created/updated timestamps
2. THE Pipeline SHALL persist references to all intermediate artifacts (script text, audio path, transcript data, scene plan, scene directions, generated code path, final video path) in the job record
3. WHEN a job reaches the "completed" status, THE Pipeline SHALL retain the final video path in the Object_Store for at least 7 days
4. THE Pipeline SHALL support listing jobs with pagination, ordered by creation date descending
