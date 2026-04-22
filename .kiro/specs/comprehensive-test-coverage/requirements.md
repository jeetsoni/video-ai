# Requirements Document

## Introduction

This feature closes the highest-impact testing gaps across the KalpanaAI (video-ai) Turborepo monorepo. The project has 40 existing test files but significant blind spots: only 3 of 18 application use cases are tested, only 1 property-based test exists, and the shared package has minimal schema validation coverage. This spec targets the core use cases that drive the pipeline, adds property-based tests that demonstrate the methodology, and covers shared package schemas — maximizing test coverage across all architecture layers. All requirements are based on the current working implementation, not on prior spec documents which may have diverged during development.

## Glossary

- **Use_Case**: An application-layer class implementing the `UseCase<TRequest, TResponse>` interface that orchestrates domain logic, validation, persistence, and queue operations
- **Result**: A discriminated union type (`Result<T, E>`) used across all operations to represent success or failure without exceptions
- **PipelineJob**: The root aggregate entity representing a video generation pipeline job with stage transitions, status tracking, and artifact storage
- **Repository**: An interface (`PipelineJobRepository`) abstracting persistence operations (save, findById, findAll, count)
- **QueueService**: An interface abstracting BullMQ job enqueueing for pipeline stage processing
- **ObjectStore**: An interface abstracting MinIO/S3 object storage for signed URLs and file retrieval
- **PBT**: Property-Based Testing — a testing methodology using libraries like fast-check to generate random inputs and verify universal properties hold for all of them
- **Zod_Schema**: A runtime validation schema defined using the Zod library, used for input validation and type inference
- **ScriptStreamEvent**: A discriminated union of SSE event types (chunk, status, scene, done, error) defined as Zod schemas in the shared package
- **PipelineStage**: A value object representing one of 10 ordered stages in the video generation pipeline with defined valid transitions
- **ValidationError**: A domain error type with a `message` and `code` field, returned inside `Result.fail()` for invalid operations

## Requirements

### Requirement 1: Create Pipeline Job Use Case Tests

**User Story:** As a developer, I want the `CreatePipelineJobUseCase` to be tested, so that the critical job creation flow is verified against valid inputs, invalid inputs, and downstream failures.

#### Acceptance Criteria

1. WHEN a valid request with topic, format, themeId, and browserId is provided, THE Use_Case SHALL return a successful Result containing the job id and "pending" status
2. WHEN the request contains an invalid format value, THE Use_Case SHALL return a failed Result with a ValidationError
3. WHEN the request contains a topic shorter than 3 characters, THE Use_Case SHALL return a failed Result with a ValidationError containing code "INVALID_INPUT"
4. WHEN the QueueService enqueue operation fails, THE Use_Case SHALL return a failed Result with a ValidationError containing code "QUEUE_ERROR"
5. WHEN a valid request is processed successfully, THE Use_Case SHALL call Repository save exactly once with a PipelineJob entity
6. WHEN a valid request is processed successfully, THE Use_Case SHALL call QueueService enqueue with stage "script_generation" and the generated job id

### Requirement 2: Approve Script Use Case Tests

**User Story:** As a developer, I want the `ApproveScriptUseCase` to be tested, so that the script approval flow including word count validation and voice selection is verified.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for a job in "awaiting_script_review" status with no edited script, THE Use_Case SHALL approve the generated script and return a successful Result
2. WHEN a valid jobId is provided with an edited script within the format word count range, THE Use_Case SHALL approve the edited script and transition the job to "tts_generation" stage
3. WHEN a valid jobId is provided with an edited script containing fewer than 10 words, THE Use_Case SHALL return a failed Result with code "INVALID_WORD_COUNT"
4. WHEN a valid jobId is provided with an edited script outside the format word count range, THE Use_Case SHALL return a failed Result with code "INVALID_WORD_COUNT"
5. WHEN the jobId does not exist in the Repository, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
6. WHEN the job is not in "awaiting_script_review" status, THE Use_Case SHALL return a failed Result with code "CONFLICT"
7. WHEN a voiceId is provided in the request, THE Use_Case SHALL update the job voice selection before approving

### Requirement 3: Get Job Status Use Case Tests

**User Story:** As a developer, I want the `GetJobStatusUseCase` to be tested, so that the DTO mapping logic including conditional fields and signed URL generation is verified.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for an existing job, THE Use_Case SHALL return a successful Result containing a PipelineJobDto with all base fields mapped correctly
2. WHEN the job has a completed status and a videoPath, THE Use_Case SHALL include a signed videoUrl in the DTO
3. WHEN the job has an error, THE Use_Case SHALL include errorCode and errorMessage in the DTO
4. WHEN the job is in "preview" or "done" stage with generated code, THE Use_Case SHALL include a codeChanged field in the DTO
5. WHEN the jobId does not exist in the Repository, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"

### Requirement 4: Regenerate Script Use Case Tests

**User Story:** As a developer, I want the `RegenerateScriptUseCase` to be tested, so that the script regeneration flow from review back to generation is verified.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for a job in "awaiting_script_review" status, THE Use_Case SHALL transition the job to "script_generation" stage and return a successful Result
2. WHEN a valid request is processed successfully, THE Use_Case SHALL enqueue a "script_generation" job via QueueService
3. WHEN the jobId does not exist in the Repository, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
4. WHEN the job is not in "awaiting_script_review" status, THE Use_Case SHALL return a failed Result with code "CONFLICT"

### Requirement 5: Retry Job Use Case Tests

**User Story:** As a developer, I want the `RetryJobUseCase` to be tested, so that the retry flow for failed and stuck jobs is verified including status clearing and re-enqueueing.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for a failed job at a processing stage, THE Use_Case SHALL clear the failure, save the job, and enqueue it for the current stage
2. WHEN a valid jobId is provided for a stuck processing job, THE Use_Case SHALL re-enqueue the job for its current stage
3. WHEN the job is in a non-retryable status like "awaiting_script_review" or "completed", THE Use_Case SHALL return a failed Result with code "CONFLICT"
4. WHEN the jobId does not exist in the Repository, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
5. WHEN the QueueService enqueue operation fails, THE Use_Case SHALL return a failed Result with code "QUEUE_ERROR"

### Requirement 6: Export Video Use Case Tests

**User Story:** As a developer, I want the `ExportVideoUseCase` to be tested, so that the video export and re-render flow from preview and done stages is verified.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for a job in "preview" stage, THE Use_Case SHALL transition to "rendering" and enqueue a rendering job
2. WHEN a valid jobId is provided for a job in "done" stage, THE Use_Case SHALL clear the existing video URL, transition to "rendering", and enqueue a rendering job
3. WHEN the job is not in "preview" or "done" stage, THE Use_Case SHALL return a failed Result with code "INVALID_STAGE"
4. WHEN the jobId does not exist in the Repository, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"

### Requirement 7: List Pipeline Jobs Use Case Tests

**User Story:** As a developer, I want the `ListPipelineJobsUseCase` to be tested, so that the pagination logic and DTO mapping for job listings is verified.

#### Acceptance Criteria

1. WHEN valid page and limit parameters are provided, THE Use_Case SHALL return a successful Result containing jobs, total count, page, and limit
2. WHEN page or limit is less than 1, THE Use_Case SHALL return a failed Result with code "INVALID_INPUT"
3. WHEN a browserId filter is provided, THE Use_Case SHALL pass the browserId to both Repository findAll and count methods

### Requirement 8: Get Preview Data Use Case Tests

**User Story:** As a developer, I want the `GetPreviewDataUseCase` to be tested, so that the preview data assembly including scene plan construction and audio URL resolution is verified.

#### Acceptance Criteria

1. WHEN a valid jobId is provided for a job in "preview" stage with all required artifacts, THE Use_Case SHALL return a successful Result containing code, scenePlan, audioUrl, format, fps, totalFrames, and composition dimensions
2. WHEN the job is not in a valid preview stage ("preview", "rendering", or "done"), THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
3. WHEN the job has no generated code, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
4. WHEN the job has no scene directions, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"
5. WHEN the job has no transcript, THE Use_Case SHALL return a failed Result with code "NOT_FOUND"

### Requirement 9: Script Stream Event Schema Round-Trip Property Test

**User Story:** As a developer, I want a property-based test verifying that ScriptStreamEvent Zod schemas correctly round-trip through JSON serialization, so that event parsing reliability is proven for all event variants.

#### Acceptance Criteria

1. FOR ALL valid ScriptStreamEvent objects generated across all 5 variants (chunk, status, scene, done, error), THE Zod_Schema SHALL successfully parse the JSON-serialized and deserialized event back to a deeply equal object
2. FOR ALL generated ScriptStreamEvent objects, THE serialized JSON string SHALL be valid JSON parseable by `JSON.parse`
3. FOR ALL generated ScriptStreamEvent objects, THE `type` discriminator field SHALL be preserved exactly through the round-trip

### Requirement 10: Pipeline Stage Transition Validity Property Test

**User Story:** As a developer, I want a property-based test verifying that PipelineStage transitions follow the defined transition graph, so that invalid state transitions are proven impossible.

#### Acceptance Criteria

1. FOR ALL pairs of PipelineStage values where `canTransitionTo` returns true, THE PipelineJob `transitionTo` method SHALL succeed and update the stage to the target value
2. FOR ALL pairs of PipelineStage values where `canTransitionTo` returns false, THE PipelineJob `transitionTo` method SHALL return a failed Result with code "INVALID_TRANSITION"
3. FOR ALL valid PipelineStage values, THE PipelineStage `create` method SHALL return a non-null PipelineStage instance

### Requirement 11: Pipeline Zod Schema Validation Property Test

**User Story:** As a developer, I want a property-based test verifying that the `createPipelineJobSchema` correctly validates and rejects inputs, so that input validation boundaries are proven correct.

#### Acceptance Criteria

1. FOR ALL valid objects conforming to the createPipelineJobSchema shape (topic 3-500 chars, format in ["reel","short","longform"], themeId non-empty), THE Zod_Schema `safeParse` SHALL return success with the parsed data matching the input
2. FOR ALL strings shorter than 3 characters used as topic, THE Zod_Schema `safeParse` SHALL return failure
3. FOR ALL strings not in the valid format enum used as format, THE Zod_Schema `safeParse` SHALL return failure

### Requirement 12: Shared Package Schema and Constant Tests

**User Story:** As a developer, I want the shared package schemas, voice registry, format config, and SFX library to be tested, so that exported constants and validation schemas are verified as structurally correct.

#### Acceptance Criteria

1. THE voice registry SHALL export exactly 3 featured voices with valid voiceId, name, category, gender, and description fields
2. THE DEFAULT_VOICE_ID SHALL match the voiceId of the first featured voice
3. THE FEATURED_VOICE_IDS set SHALL contain exactly the voiceIds from FEATURED_VOICES
4. THE FORMAT_WORD_RANGES SHALL define min and max ranges for all three video formats ("reel", "short", "longform") where min is less than max
5. THE FORMAT_RESOLUTIONS SHALL define width and height for all three video formats where all values are positive integers
6. THE SCENE_SFX_MAP SHALL define an SfxProfile for all 8 scene types with valid ambience and transition filenames
7. THE ALL_SFX_ASSETS array SHALL contain all ambient, transition, and utility assets combined
8. THE ALL_SFX_FILENAMES array SHALL have the same length as ALL_SFX_ASSETS and contain only `.mp3` filenames
9. WHEN a valid `voiceSettingsSchema` object is provided with speed, stability, similarityBoost, and style within their defined ranges, THE Zod_Schema SHALL parse successfully
10. WHEN a `voiceSettingsSchema` object has speed outside the 0.7-1.2 range, THE Zod_Schema SHALL reject the input
