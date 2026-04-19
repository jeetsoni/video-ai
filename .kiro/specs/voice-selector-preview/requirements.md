# Requirements Document

## Introduction

The Pipeline Wizard (Draft Hero) currently hardcodes the ElevenLabs voice to "Rachel" (`21m00Tcm4TlvDq8ikWAM`) for all TTS generation. This feature adds a voice selector with audio preview to the Pipeline Wizard, allowing users to browse ElevenLabs voices, hear a 5-second preview, and choose a voice before creating a pipeline job. The selected voice ID flows through the entire pipeline from frontend to the TTS generation worker, replacing the global default.

## Glossary

- **Pipeline_Wizard**: The frontend form component (Draft Hero) where users configure and submit a new video pipeline job by specifying topic, format, theme, and now voice.
- **Voice_Selector**: A UI component within the Pipeline Wizard that displays available ElevenLabs voices and allows the user to pick one.
- **Voice_Preview**: An inline audio playback control that plays a short sample clip of a voice so the user can hear it before selecting.
- **Featured_Voice**: One of five curated, recommended voices displayed prominently at the top of the Voice Selector.
- **Voice_Registry**: A static configuration defining the five featured voices with their ElevenLabs voice IDs, display names, and descriptions.
- **Voices_API_Endpoint**: A backend REST endpoint that returns the list of available ElevenLabs voices with metadata and preview URLs.
- **PipelineJob**: The domain entity representing a video generation job, persisted in PostgreSQL via Prisma.
- **TTS_Worker**: The background queue worker that generates speech audio from an approved script using the ElevenLabs API.
- **Shared_Schema**: The Zod validation schema (`createPipelineJobSchema`) in `@video-ai/shared` that validates pipeline job creation input.

## Requirements

### Requirement 1: Voice Registry Configuration

**User Story:** As a developer, I want a centralized registry of featured voices, so that the recommended voices are consistent across frontend and backend.

#### Acceptance Criteria

1. THE Voice_Registry SHALL define exactly five Featured_Voice entries, each containing a voice ID, display name, category, gender, and short description.
2. THE Voice_Registry SHALL include the following voices in this exact order:

   **Fast, energetic narration (social media / YouTube style):**
   - **Natasha — Valley Girl** (`uxKr2vlA4hYgXZR1oPRT`) — The most popular ElevenLabs voice for social media with 6B+ characters generated. Energetic, attention-grabbing, fast-paced. Female.
   - **Aaron — AI and Tech News** — Most popular among AI/tech YouTubers. Clear, natural, good pace. Male.

   **Natural, human-like narration (general purpose):**
   - **Josh** (`TxGEqnHWrfWFTfGW9XjX`) — Clear, authoritative, frequently used by documentary and motivational channels. Male.
   - **Adam** (`pNInz6obpgDQGcFmaJgB`) — Deep, warm, emotionally resonant. Male.
   - **Bella** — Stable, calm but natural narration. Female.

3. THE Voice_Registry SHALL group the Featured_Voice entries under two category labels: "Fast & Energetic" (Natasha, Aaron) and "Natural & Human-like" (Josh, Adam, Bella).
4. THE Voice_Registry SHALL be defined in the `@video-ai/shared` package so both frontend and backend can import it.

### Requirement 2: Voices API Endpoint

**User Story:** As a frontend developer, I want a backend endpoint that returns available voices with preview URLs, so that the Voice Selector can display voice options and play previews.

#### Acceptance Criteria

1. WHEN the frontend sends a GET request to the Voices_API_Endpoint, THE Voices_API_Endpoint SHALL return a list of voices containing at minimum the five Featured_Voice entries.
2. WHEN the Voices_API_Endpoint returns voice data, each voice entry SHALL include a voice ID, display name, description, and a preview audio URL.
3. WHEN the Voices_API_Endpoint returns voice data, THE Voices_API_Endpoint SHALL mark each Featured_Voice with a `featured` flag set to true.
4. WHEN the Voices_API_Endpoint returns voice data, THE Voices_API_Endpoint SHALL sort Featured_Voice entries before non-featured voices.
5. IF the ElevenLabs API call to fetch voices fails, THEN THE Voices_API_Endpoint SHALL return the five Featured_Voice entries from the Voice_Registry as a fallback without preview URLs.

### Requirement 3: Voice Selector UI Component

**User Story:** As a content creator, I want to browse and select a voice in the Pipeline Wizard, so that I can choose the best voice for my video.

#### Acceptance Criteria

1. THE Voice_Selector SHALL display the five Featured_Voice entries in a "Recommended" section at the top of the selector.
2. THE Voice_Selector SHALL display each voice entry with its name and short description.
3. WHEN the user selects a voice, THE Voice_Selector SHALL visually indicate the selected voice with a distinct highlight or check mark.
4. WHEN the Pipeline_Wizard loads, THE Voice_Selector SHALL default to the first Featured_Voice (Natasha — Valley Girl, `uxKr2vlA4hYgXZR1oPRT`) as the pre-selected voice.
5. THE Voice_Selector SHALL be accessible, providing keyboard navigation and appropriate ARIA labels for screen readers.

### Requirement 4: Voice Audio Preview

**User Story:** As a content creator, I want to hear a short audio sample of each voice, so that I can make an informed choice before creating my video.

#### Acceptance Criteria

1. WHEN the user clicks a preview button on a voice entry, THE Voice_Preview SHALL play the audio sample from the voice's preview URL.
2. WHILE the Voice_Preview is playing audio for one voice, WHEN the user clicks preview on a different voice, THE Voice_Preview SHALL stop the current playback and start playing the new voice sample.
3. WHEN the Voice_Preview finishes playing the audio sample, THE Voice_Preview SHALL reset the play button to its idle state.
4. IF the preview audio URL is unavailable for a voice, THEN THE Voice_Selector SHALL hide the preview button for that voice entry.
5. IF the preview audio fails to load or play, THEN THE Voice_Preview SHALL display a brief inline error indicator and remain functional for other voices.

### Requirement 5: Shared Schema Update

**User Story:** As a developer, I want the pipeline job creation schema to accept an optional voice ID, so that the voice selection is validated consistently across frontend and backend.

#### Acceptance Criteria

1. THE Shared_Schema SHALL accept an optional `voiceId` field of type string.
2. WHEN the `voiceId` field is omitted from a job creation request, THE Shared_Schema SHALL pass validation without error.
3. WHEN the `voiceId` field is provided, THE Shared_Schema SHALL validate that the value is a non-empty string.

### Requirement 6: Database Schema Update

**User Story:** As a developer, I want the PipelineJob database model to store the selected voice ID, so that the TTS worker can read it when processing the job.

#### Acceptance Criteria

1. THE PipelineJob database model SHALL include a nullable `voiceId` column of type string.
2. WHEN a PipelineJob record has a null `voiceId`, THE PipelineJob SHALL be interpreted as using the default voice (`21m00Tcm4TlvDq8ikWAM`).
3. THE PipelineJob database migration SHALL be backward-compatible, setting `voiceId` to null for all existing records.

### Requirement 7: Pipeline Job Creation Flow

**User Story:** As a content creator, I want my voice selection to be saved with my pipeline job, so that the correct voice is used during TTS generation.

#### Acceptance Criteria

1. WHEN the user submits the Pipeline_Wizard with a selected voice, THE Pipeline_Wizard SHALL include the `voiceId` in the job creation request payload.
2. WHEN the backend receives a job creation request with a `voiceId`, THE PipelineJob entity SHALL store the provided `voiceId`.
3. WHEN the backend receives a job creation request without a `voiceId`, THE PipelineJob entity SHALL store null for `voiceId`, falling back to the default voice.
4. THE PipelineJob domain entity SHALL expose a `voiceId` getter that returns the stored voice ID or null.

### Requirement 8: TTS Worker Per-Job Voice Selection

**User Story:** As a developer, I want the TTS worker to read the voice ID from each pipeline job, so that each video uses the voice the user selected instead of a global default.

#### Acceptance Criteria

1. WHEN the TTS_Worker processes a job, THE TTS_Worker SHALL read the `voiceId` from the PipelineJob entity.
2. WHEN the PipelineJob has a non-null `voiceId`, THE TTS_Worker SHALL pass that `voiceId` to the TTS service for speech generation.
3. WHEN the PipelineJob has a null `voiceId`, THE TTS_Worker SHALL use the default voice ID (`21m00Tcm4TlvDq8ikWAM`) for speech generation.
4. THE TTS_Worker SHALL no longer depend on a global voice ID passed via constructor for per-job voice selection.

### Requirement 9: Pipeline Job DTO Update

**User Story:** As a frontend developer, I want the job status response to include the selected voice ID, so that the UI can display which voice was chosen for a job.

#### Acceptance Criteria

1. WHEN the backend returns a PipelineJob DTO, THE PipelineJob DTO SHALL include an optional `voiceId` field.
2. WHEN the PipelineJob has a stored `voiceId`, THE PipelineJob DTO SHALL return that value in the `voiceId` field.
3. WHEN the PipelineJob has no stored `voiceId`, THE PipelineJob DTO SHALL omit the `voiceId` field or return null.
