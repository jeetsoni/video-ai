# Requirements Document

## Introduction

Replace the HTTP polling mechanism (`usePipelineJob`) for pipeline job progress tracking with a Server-Sent Events (SSE) based real-time push system. The new system reuses the existing SSE infrastructure (Redis Pub/Sub, StreamEventPublisher, SSEClient, ExpressSSEResponseHelper) to deliver stage transitions, status changes, and progress updates to the frontend without repeated HTTP requests. The existing script-generation streaming SSE (`useStreamingScript` + `GET /api/pipeline/jobs/:id/stream`) remains completely independent and untouched.

## Glossary

- **Pipeline_Progress_SSE_Endpoint**: The new backend HTTP endpoint (`GET /api/pipeline/jobs/:id/progress`) that establishes an SSE connection and pushes pipeline progress events to the client
- **Pipeline_Progress_Publisher**: The component within backend workers responsible for publishing stage-change events to Redis Pub/Sub after a successful `transitionTo()` + `save()` call
- **UsePipelineProgress_Hook**: The new React hook that replaces `usePipelineJob`, performing an initial HTTP fetch then subscribing to the Pipeline_Progress_SSE_Endpoint for live updates
- **Progress_Event**: An SSE message containing the current stage, status, progress percentage, and optional metadata about the pipeline job
- **Pipeline_Job**: The domain entity representing a video generation pipeline job, progressing through 10 stages with 5 possible statuses
- **Terminal_Status**: A pipeline status (completed, failed, awaiting_script_review) after which the SSE connection closes
- **Stage_Transition**: The act of a pipeline job moving from one stage to the next (e.g., tts_generation → transcription)
- **Initial_Fetch**: A single HTTP GET request to retrieve the current job state before the SSE connection is established
- **StreamEventPublisher**: The existing Redis-backed publisher that publishes events to Pub/Sub channels and buffers them for replay
- **SSEClient**: The existing frontend class that connects to SSE endpoints via fetch, parses event streams, and yields typed events

## Requirements

### Requirement 1: Pipeline Progress SSE Endpoint

**User Story:** As a frontend client, I want to subscribe to a real-time SSE stream for a pipeline job, so that I receive stage and status updates without polling.

#### Acceptance Criteria

1. WHEN a client sends a GET request to `/api/pipeline/jobs/:id/progress`, THE Pipeline_Progress_SSE_Endpoint SHALL establish an SSE connection and respond with `Content-Type: text/event-stream`
2. WHEN the job ID is not a valid UUID, THE Pipeline_Progress_SSE_Endpoint SHALL respond with HTTP 400 and a JSON error body containing code "INVALID_INPUT"
3. WHEN the job ID does not correspond to an existing pipeline job, THE Pipeline_Progress_SSE_Endpoint SHALL respond with HTTP 404 and a JSON error body containing code "NOT_FOUND"
4. WHEN the SSE connection is established, THE Pipeline_Progress_SSE_Endpoint SHALL send an initial Progress_Event containing the current stage, status, and progress percentage of the job
5. WHEN a Progress_Event is published to the Redis Pub/Sub channel for the job, THE Pipeline_Progress_SSE_Endpoint SHALL forward the event to the connected client within the same event loop tick
6. WHEN the job reaches a Terminal_Status (completed, failed, or awaiting_script_review), THE Pipeline_Progress_SSE_Endpoint SHALL send a final Progress_Event and close the SSE connection
7. WHILE the SSE connection is open, THE Pipeline_Progress_SSE_Endpoint SHALL send a heartbeat comment every 15 seconds to prevent proxy timeouts
8. WHEN the client disconnects, THE Pipeline_Progress_SSE_Endpoint SHALL unsubscribe from the Redis Pub/Sub channel and release resources

### Requirement 2: Worker Stage-Change Event Publishing

**User Story:** As the system, I want each backend worker to publish a progress event after completing a stage transition, so that connected SSE clients receive real-time updates.

#### Acceptance Criteria

1. WHEN a worker successfully calls `transitionTo()` and `save()` on a Pipeline_Job, THE Pipeline_Progress_Publisher SHALL publish a Progress_Event to the Redis Pub/Sub channel `stream:progress:{jobId}`
2. THE Progress_Event SHALL contain the fields: `type` ("progress"), `seq` (monotonically increasing integer), `data.stage` (current stage name), `data.status` (current status), and `data.progressPercent` (integer 0–100)
3. WHEN a worker marks a job as failed via `markFailed()` and `save()`, THE Pipeline_Progress_Publisher SHALL publish a Progress_Event with status "failed" and include `data.errorCode` and `data.errorMessage`
4. THE Pipeline_Progress_Publisher SHALL reuse the existing StreamEventPublisher interface for publishing to Redis Pub/Sub
5. WHEN the TTS generation worker transitions through multiple stages (tts_generation → transcription → timestamp_mapping), THE Pipeline_Progress_Publisher SHALL publish a Progress_Event for each Stage_Transition

### Requirement 3: Frontend Pipeline Progress Hook

**User Story:** As a frontend developer, I want a React hook that fetches initial job state and then subscribes to SSE for live updates, so that the UI reflects pipeline progress in real-time without polling.

#### Acceptance Criteria

1. WHEN the UsePipelineProgress_Hook mounts, THE UsePipelineProgress_Hook SHALL perform an Initial_Fetch via `GET /api/pipeline/jobs/:id` to retrieve the current job state
2. WHEN the Initial_Fetch succeeds and the job is not in a Terminal_Status, THE UsePipelineProgress_Hook SHALL establish an SSE connection to the Pipeline_Progress_SSE_Endpoint
3. WHEN a Progress_Event is received from the SSE stream, THE UsePipelineProgress_Hook SHALL update its returned job state with the new stage, status, and progress percentage
4. WHEN the SSE connection receives a terminal event (completed, failed, or awaiting_script_review), THE UsePipelineProgress_Hook SHALL close the SSE connection and stop listening
5. WHEN the Initial_Fetch indicates the job is already in a Terminal_Status, THE UsePipelineProgress_Hook SHALL return the job data without establishing an SSE connection
6. IF the SSE connection fails, THEN THE UsePipelineProgress_Hook SHALL set an error state accessible to the consuming component
7. THE UsePipelineProgress_Hook SHALL expose a `refetch` function that performs a single HTTP fetch to refresh the job state
8. THE UsePipelineProgress_Hook SHALL expose a `reconnect` function that closes any existing SSE connection and opens a new one (for use after approve/regenerate/export actions)

### Requirement 4: Removal of Polling Hook

**User Story:** As a developer, I want the polling-based `usePipelineJob` hook removed entirely, so that there is a single real-time mechanism for tracking pipeline progress.

#### Acceptance Criteria

1. WHEN the migration is complete, THE codebase SHALL not contain the `usePipelineJob` hook file or any imports referencing the `usePipelineJob` hook
2. WHEN the migration is complete, THE job detail page SHALL use the UsePipelineProgress_Hook as the sole mechanism for obtaining pipeline job state
3. THE UsePipelineProgress_Hook SHALL provide the same return shape fields (job, isLoading, error) that consuming components previously obtained from `usePipelineJob`

### Requirement 5: Independence of Script Streaming SSE

**User Story:** As a developer, I want the existing script generation SSE system to remain completely untouched, so that script streaming continues to work independently of pipeline progress streaming.

#### Acceptance Criteria

1. THE `useStreamingScript` hook SHALL continue to connect to `GET /api/pipeline/jobs/:id/stream` without modification
2. THE StreamController class handling script generation streaming SHALL remain unchanged
3. THE Pipeline_Progress_SSE_Endpoint SHALL use a separate Redis Pub/Sub channel pattern (`stream:progress:{jobId}`) distinct from the script streaming channel (`stream:script:{jobId}`)
4. WHILE both the script streaming SSE and pipeline progress SSE are active for the same job, THE two connections SHALL operate independently without interference

### Requirement 6: Post-Action SSE Reconnection

**User Story:** As a user, I want the UI to receive real-time updates after I approve a script, regenerate, or export, so that I see progress without manual refresh.

#### Acceptance Criteria

1. WHEN the user approves a script, THE job detail page SHALL call `reconnect` on the UsePipelineProgress_Hook to receive subsequent stage updates via SSE
2. WHEN the user triggers a script regeneration, THE job detail page SHALL call `reconnect` on the UsePipelineProgress_Hook to track the new pipeline run via SSE
3. WHEN the user triggers a video export, THE job detail page SHALL call `reconnect` on the UsePipelineProgress_Hook to track rendering progress via SSE
4. WHEN `reconnect` is called, THE UsePipelineProgress_Hook SHALL first perform a fresh Initial_Fetch, then establish a new SSE connection if the job is not in a Terminal_Status
