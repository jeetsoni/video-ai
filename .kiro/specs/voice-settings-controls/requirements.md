# Requirements Document

## Introduction

The Pipeline Wizard (Draft Hero) currently hardcodes ElevenLabs voice settings (`stability: 0.5`, `similarityBoost: 0.75`) in the TTS service. This feature exposes all four ElevenLabs voice settings — Speed, Stability, Similarity Boost, and Style — as user-facing slider controls in the Pipeline Wizard. Users can fine-tune how the selected voice sounds before creating a pipeline job. The settings flow through the full pipeline: frontend sliders → shared Zod schema → PipelineJob database record → TTS worker → ElevenLabs `textToSpeech.convertWithTimestamps()` API call as `voiceSettings`.

This feature builds on the existing voice selector (see `.kiro/specs/voice-selector-preview/`), which already passes `voiceId` through the pipeline. The voice settings controls sit alongside the voice selector in the Pipeline Wizard UI.

## Glossary

- **Pipeline_Wizard**: The frontend form component (Draft Hero) where users configure and submit a new video pipeline job by specifying topic, format, theme, voice, and now voice settings.
- **Voice_Settings_Controls**: A set of four slider inputs in the Pipeline Wizard that allow the user to adjust Speed, Stability, Similarity Boost, and Style for the selected voice.
- **Voice_Settings**: A data object containing four numeric fields (`speed`, `stability`, `similarityBoost`, `style`) that configure how the ElevenLabs TTS engine renders a voice.
- **Speed_Setting**: A numeric value between 0.7 and 1.2 (inclusive) controlling speaking pace. Values below 1.0 slow down speech; values above 1.0 speed up speech. Default is 1.0.
- **Stability_Setting**: A numeric value between 0.0 and 1.0 (inclusive) controlling delivery consistency. Higher values produce more consistent delivery; lower values produce more expressive, varied delivery. Default is 0.5.
- **Similarity_Boost_Setting**: A numeric value between 0.0 and 1.0 (inclusive) controlling how closely the output matches the original voice identity. Default is 0.75.
- **Style_Setting**: A numeric value between 0.0 and 1.0 (inclusive) adding stylization and emotion to the voice. Higher values increase expressiveness but can reduce stability. Default is 0.0.
- **Shared_Schema**: The Zod validation schema (`createPipelineJobSchema`) in `@video-ai/shared` that validates pipeline job creation input.
- **PipelineJob**: The domain entity representing a video generation job, persisted in PostgreSQL via Prisma.
- **TTS_Worker**: The background queue worker that generates speech audio from an approved script using the ElevenLabs API.
- **TTS_Service**: The infrastructure service (`ElevenLabsTTSService`) that wraps the ElevenLabs SDK and calls `client.textToSpeech.convertWithTimestamps()`.
- **Voice_Selector**: The existing UI component within the Pipeline Wizard that displays available ElevenLabs voices and allows the user to pick one.

## Requirements

### Requirement 1: Voice Settings Shared Types

**User Story:** As a developer, I want a shared type definition for voice settings, so that the frontend, backend, and validation schema use a consistent structure.

#### Acceptance Criteria

1. THE Shared_Schema package SHALL export a `VoiceSettings` type containing four numeric fields: `speed`, `stability`, `similarityBoost`, and `style`.
2. THE Shared_Schema package SHALL export a `DEFAULT_VOICE_SETTINGS` constant with values `speed: 1.0`, `stability: 0.5`, `similarityBoost: 0.75`, `style: 0.0`.
3. THE Shared_Schema package SHALL export the valid range boundaries for each setting: Speed 0.7–1.2, Stability 0.0–1.0, Similarity Boost 0.0–1.0, Style 0.0–1.0.

### Requirement 2: Shared Schema Validation for Voice Settings

**User Story:** As a developer, I want the pipeline job creation schema to validate optional voice settings fields, so that invalid values are rejected consistently across frontend and backend.

#### Acceptance Criteria

1. THE Shared_Schema SHALL accept an optional `voiceSettings` object field in the `createPipelineJobSchema`.
2. WHEN the `voiceSettings` field is omitted from a job creation request, THE Shared_Schema SHALL pass validation without error.
3. WHEN the `voiceSettings` field is provided, THE Shared_Schema SHALL validate that `speed` is a number between 0.7 and 1.2 inclusive.
4. WHEN the `voiceSettings` field is provided, THE Shared_Schema SHALL validate that `stability` is a number between 0.0 and 1.0 inclusive.
5. WHEN the `voiceSettings` field is provided, THE Shared_Schema SHALL validate that `similarityBoost` is a number between 0.0 and 1.0 inclusive.
6. WHEN the `voiceSettings` field is provided, THE Shared_Schema SHALL validate that `style` is a number between 0.0 and 1.0 inclusive.
7. WHEN any voice setting value is outside its valid range, THE Shared_Schema SHALL reject the payload with a validation error identifying the invalid field.
8. WHEN the `voiceSettings` object is provided, THE Shared_Schema SHALL require all four fields (`speed`, `stability`, `similarityBoost`, `style`) to be present within the object.

### Requirement 3: Database Schema for Voice Settings

**User Story:** As a developer, I want the PipelineJob database model to store voice settings, so that the TTS worker can read them when processing the job.

#### Acceptance Criteria

1. THE PipelineJob database model SHALL include a nullable `voiceSettings` column stored as JSON.
2. WHEN a PipelineJob record has a null `voiceSettings` value, THE PipelineJob SHALL be interpreted as using the default voice settings (`speed: 1.0`, `stability: 0.5`, `similarityBoost: 0.75`, `style: 0.0`).
3. THE PipelineJob database migration SHALL be backward-compatible, setting `voiceSettings` to null for all existing records.

### Requirement 4: Domain Entity for Voice Settings

**User Story:** As a developer, I want the PipelineJob domain entity to carry voice settings, so that the settings are available throughout the pipeline processing lifecycle.

#### Acceptance Criteria

1. THE PipelineJob domain entity SHALL include a `voiceSettings` property of type `VoiceSettings` or null.
2. WHEN a PipelineJob is created with voice settings, THE PipelineJob entity SHALL store the provided Voice_Settings values.
3. WHEN a PipelineJob is created without voice settings, THE PipelineJob entity SHALL store null for `voiceSettings`.
4. THE PipelineJob domain entity SHALL expose a `voiceSettings` getter that returns the stored Voice_Settings object or null.

### Requirement 5: Pipeline Job Creation Flow with Voice Settings

**User Story:** As a content creator, I want my voice settings to be saved with my pipeline job, so that the correct voice tuning is used during TTS generation.

#### Acceptance Criteria

1. WHEN the user submits the Pipeline_Wizard with voice settings, THE Pipeline_Wizard SHALL include the `voiceSettings` object in the job creation request payload.
2. WHEN the backend receives a job creation request with `voiceSettings`, THE PipelineJob entity SHALL store the provided Voice_Settings.
3. WHEN the backend receives a job creation request without `voiceSettings`, THE PipelineJob entity SHALL store null for `voiceSettings`, falling back to the default voice settings during TTS generation.

### Requirement 6: TTS Worker Voice Settings Pass-Through

**User Story:** As a developer, I want the TTS worker to read voice settings from each pipeline job and pass them to the ElevenLabs API, so that each video uses the voice tuning the user configured.

#### Acceptance Criteria

1. WHEN the TTS_Worker processes a job, THE TTS_Worker SHALL read the `voiceSettings` from the PipelineJob entity.
2. WHEN the PipelineJob has non-null `voiceSettings`, THE TTS_Worker SHALL pass those settings to the TTS_Service for speech generation.
3. WHEN the PipelineJob has null `voiceSettings`, THE TTS_Worker SHALL pass the default voice settings (`speed: 1.0`, `stability: 0.5`, `similarityBoost: 0.75`, `style: 0.0`) to the TTS_Service.

### Requirement 7: TTS Service ElevenLabs API Integration

**User Story:** As a developer, I want the TTS service to forward voice settings to the ElevenLabs SDK, so that the generated audio reflects the user's tuning choices.

#### Acceptance Criteria

1. WHEN the TTS_Service generates speech, THE TTS_Service SHALL pass the `stability`, `similarityBoost`, and `style` values to the ElevenLabs SDK `convertWithTimestamps()` call as the `voiceSettings` parameter.
2. WHEN the TTS_Service generates speech, THE TTS_Service SHALL pass the `speed` value to the ElevenLabs SDK `convertWithTimestamps()` call as a top-level `speed` parameter (per ElevenLabs SDK API).
3. THE TTS_Service SHALL no longer hardcode `stability: 0.5` and `similarityBoost: 0.75` in the `convertWithTimestamps()` call.

### Requirement 8: Voice Settings Slider Controls UI

**User Story:** As a content creator, I want slider controls for all four voice settings in the Pipeline Wizard, so that I can fine-tune how the selected voice sounds.

#### Acceptance Criteria

1. THE Voice_Settings_Controls SHALL display four labeled slider inputs: "Speed", "Stability", "Similarity Boost", and "Style".
2. THE Voice_Settings_Controls SHALL display each slider with its current numeric value.
3. THE Speed slider SHALL have a minimum of 0.7, maximum of 1.2, and a step increment of 0.1.
4. THE Stability slider SHALL have a minimum of 0.0, maximum of 1.0, and a step increment of 0.05.
5. THE Similarity Boost slider SHALL have a minimum of 0.0, maximum of 1.0, and a step increment of 0.05.
6. THE Style slider SHALL have a minimum of 0.0, maximum of 1.0, and a step increment of 0.05.
7. WHEN the Pipeline_Wizard loads, THE Voice_Settings_Controls SHALL initialize each slider to its default value: Speed 1.0, Stability 0.5, Similarity Boost 0.75, Style 0.0.
8. WHEN the user adjusts a slider, THE Voice_Settings_Controls SHALL update the displayed numeric value in real time.
9. THE Voice_Settings_Controls SHALL display a brief description below each slider label explaining what the setting does.
10. THE Voice_Settings_Controls SHALL be rendered directly below the Voice_Selector in the Pipeline_Wizard, visible without any toggle or expand action.
11. THE Voice_Settings_Controls SHALL be accessible, providing keyboard control for each slider and appropriate ARIA labels for screen readers.

### Requirement 9: Pipeline Job DTO Update for Voice Settings

**User Story:** As a frontend developer, I want the job status response to include voice settings, so that the UI can display which voice tuning was used for a job.

#### Acceptance Criteria

1. WHEN the backend returns a PipelineJob DTO, THE PipelineJob DTO SHALL include an optional `voiceSettings` field of type `VoiceSettings`.
2. WHEN the PipelineJob has stored voice settings, THE PipelineJob DTO SHALL return those values in the `voiceSettings` field.
3. WHEN the PipelineJob has no stored voice settings, THE PipelineJob DTO SHALL omit the `voiceSettings` field or return null.
