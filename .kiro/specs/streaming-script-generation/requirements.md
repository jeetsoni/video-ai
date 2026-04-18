# Requirements Document

## Introduction

This feature replaces the current batch script generation flow with a real-time streaming experience. Today, clicking "Draft" creates a pipeline job, enqueues a BullMQ worker, waits for the LLM to finish generating the entire script behind the scenes, and only then shows the script review page. The user sees no progress during generation.

The new flow immediately routes the user to the script preview page upon clicking "Draft" and streams the AI-generated script into the editor in real time using Server-Sent Events (SSE). The BullMQ worker remains the sole executor of LLM generation, ensuring that jobs complete regardless of client connection state. The SSE endpoint acts as a live relay/observer into the ongoing worker process via a Redis Pub/Sub channel. If the user disconnects and reconnects (e.g., page refresh), the frontend catches up on already-generated content and resumes receiving live chunks — or falls back to the database if the job already completed. The database is the source of truth; whatever the pipeline job stores is what the frontend ultimately shows. The streaming infrastructure is designed as a reusable shared layer so future features (direction generation, code generation, etc.) can adopt the same pattern with minimal effort.

## Glossary

- **Stream_Endpoint**: An Express SSE route that subscribes to a Pub_Sub_Channel for a given job and relays streaming events to the client. It does not perform LLM generation itself.
- **SSE_Client**: A frontend service that opens an EventSource or fetch-based readable stream connection to a Stream_Endpoint and yields parsed events to consuming hooks.
- **Script_Stream_Event**: A typed JSON event emitted during script generation. Variants include `chunk` (partial text), `scene` (completed scene block), `done` (final structured result), and `error` (failure details).
- **Streaming_Script_Generator**: A backend service that wraps the Vercel AI SDK `streamObject` call inside the BullMQ worker, emits Script_Stream_Events to a Pub_Sub_Channel as the LLM produces structured output incrementally, and appends each event to the Stream_Event_Buffer for reconnection catch-up.
- **Stream_Event_Buffer**: A time-limited, ordered store (Redis list) of all Script_Stream_Events emitted for a given job, enabling clients that connect mid-generation to catch up on previously emitted events.
- **Pub_Sub_Channel**: A Redis Pub/Sub channel scoped to a specific Pipeline_Job (e.g., `stream:script:<jobId>`), used by the BullMQ worker to broadcast Script_Stream_Events and by the Stream_Endpoint to relay them to connected clients. Events are ephemeral — they do not need to be persisted beyond the Stream_Event_Buffer TTL.
- **Draft_Button**: The primary call-to-action in the DraftHero component that initiates script generation.
- **Script_Review_Page**: The `/jobs/[id]` page containing the ScriptReviewEditor component where the user views and edits the generated script.
- **Pipeline_Job**: The domain entity representing a video generation job, persisted in PostgreSQL via Prisma.
- **Scene_Block**: A structured segment of the script containing an id, name, type, and narration text.
- **useStreamingScript**: A React hook that manages the SSE connection lifecycle, accumulates streamed chunks, and exposes the current script state plus connection status to the Script_Review_Page.

## Requirements

### Requirement 1: Immediate Navigation on Draft

**User Story:** As a content creator, I want to be taken to the script preview page immediately when I click "Draft", so that I do not stare at a loading spinner with no feedback.

#### Acceptance Criteria

1. WHEN the user clicks the Draft_Button with a valid topic, THE Draft_Button SHALL create a Pipeline_Job via the existing `POST /api/pipeline/jobs` endpoint and navigate to the Script_Review_Page within 2 seconds of the click.
2. WHILE the Pipeline_Job is being created, THE Draft_Button SHALL display a "Creating…" disabled state to prevent duplicate submissions.
3. IF the Pipeline_Job creation fails, THEN THE Draft_Button SHALL display an error message and remain on the current page.

### Requirement 2: SSE Stream Relay Endpoint

**User Story:** As a frontend client, I want a dedicated SSE endpoint that relays script generation events from the backend worker, so that I can receive incremental script output over a long-lived HTTP connection without the endpoint itself performing generation.

#### Acceptance Criteria

1. WHEN a GET request is made to the Stream_Endpoint with a valid job ID, THE Stream_Endpoint SHALL respond with `Content-Type: text/event-stream` headers and hold the connection open.
2. WHEN the Stream_Endpoint receives a request for a Pipeline_Job whose status is `script_review` or later and the Stream_Event_Buffer still contains events, THE Stream_Endpoint SHALL replay the final `done` event from the Stream_Event_Buffer and close the connection.
3. WHILE the SSE connection is open, THE Stream_Endpoint SHALL send periodic heartbeat comments (`:heartbeat`) at an interval no greater than 15 seconds to prevent proxy/load-balancer timeouts.
4. WHEN the client disconnects from the Stream_Endpoint, THE Stream_Endpoint SHALL clean up the Pub_Sub_Channel subscription for that client without affecting the BullMQ worker or the ongoing LLM generation.
5. THE Stream_Endpoint SHALL set `Cache-Control: no-cache` and `Connection: keep-alive` headers on the SSE response.
6. WHEN a client connects to the Stream_Endpoint for a job that is currently mid-generation, THE Stream_Endpoint SHALL first replay all previously emitted events from the Stream_Event_Buffer, then subscribe to the Pub_Sub_Channel for live events.
7. WHEN the Stream_Endpoint receives a request for a Pipeline_Job whose status is `script_review` or later and the Stream_Event_Buffer has expired, THE Stream_Endpoint SHALL fetch the completed script and scenes from the Pipeline_Job database record, return them as a single `done` event, and close the connection.

### Requirement 3: Streaming Script Generation via Worker

**User Story:** As a content creator, I want to see the script appear word-by-word in the editor as the AI writes it, so that I get immediate feedback and can start reading while generation continues.

#### Acceptance Criteria

1. WHEN script generation begins for a Pipeline_Job inside the BullMQ worker, THE Streaming_Script_Generator SHALL emit `chunk` Script_Stream_Events containing incremental text deltas as the LLM produces them, publishing each event to the Pub_Sub_Channel and appending it to the Stream_Event_Buffer.
2. WHEN a complete Scene_Block is parsed from the accumulated stream, THE Streaming_Script_Generator SHALL emit a `scene` Script_Stream_Event containing the full scene structure (id, name, type, text), publishing it to the Pub_Sub_Channel and appending it to the Stream_Event_Buffer.
3. WHEN the LLM finishes generating the entire script, THE Streaming_Script_Generator SHALL emit a single `done` Script_Stream_Event containing the complete validated script and all Scene_Blocks, publishing it to the Pub_Sub_Channel and appending it to the Stream_Event_Buffer.
4. IF the LLM call fails or times out, THEN THE Streaming_Script_Generator SHALL emit an `error` Script_Stream_Event with a descriptive error code and message to the Pub_Sub_Channel, then mark the stream as terminated.
5. WHEN the `done` event is emitted, THE Streaming_Script_Generator SHALL persist the completed script and Scene_Blocks to the Pipeline_Job entity and transition the job status to `script_review`, exactly as the current non-streaming worker does.
6. THE BullMQ worker SHALL complete the full LLM generation and persist the result to the database regardless of whether any SSE clients are connected to the Stream_Endpoint.

### Requirement 4: Frontend SSE Client

**User Story:** As a developer, I want a reusable SSE client service that can connect to any streaming endpoint, so that I can add streaming to future features without duplicating connection logic.

#### Acceptance Criteria

1. THE SSE_Client SHALL accept a URL and event type configuration and return an async iterable of typed events.
2. WHEN the SSE_Client receives a `chunk` event, THE SSE_Client SHALL parse the JSON payload and yield it to the consumer.
3. WHEN the SSE_Client receives a `done` event, THE SSE_Client SHALL yield the final event and close the connection.
4. WHEN the SSE_Client receives an `error` event, THE SSE_Client SHALL yield the error event and close the connection.
5. IF the SSE connection drops unexpectedly, THEN THE SSE_Client SHALL attempt to reconnect up to 3 times with exponential backoff (1s, 2s, 4s) before yielding a connection failure error.
6. WHEN the consumer disposes of the SSE_Client (e.g., component unmount), THE SSE_Client SHALL close the underlying HTTP connection and release resources.

### Requirement 5: Streaming Script Hook

**User Story:** As a frontend developer, I want a React hook that manages the streaming script lifecycle, so that the Script_Review_Page can display incremental script output with minimal integration code.

#### Acceptance Criteria

1. WHEN the useStreamingScript hook is initialized with a job ID, THE useStreamingScript hook SHALL first check the Pipeline_Job status via the existing job status endpoint.
2. IF the Pipeline_Job status is `script_review` or later, THEN THE useStreamingScript hook SHALL load the completed script and scenes from the database response, set the status to `complete`, and not open an SSE connection.
3. IF the Pipeline_Job status indicates generation is in progress, THEN THE useStreamingScript hook SHALL open an SSE connection to the Stream_Endpoint and begin accumulating script chunks, processing any replayed catch-up events from the Stream_Event_Buffer before live events.
4. WHILE chunks are being received, THE useStreamingScript hook SHALL expose the current accumulated script text, the list of completed Scene_Blocks, and a `status` field with value `streaming`.
5. WHEN a `done` event is received, THE useStreamingScript hook SHALL update the status to `complete` and expose the final validated script and Scene_Blocks.
6. IF an `error` event is received or the connection fails after retries, THEN THE useStreamingScript hook SHALL update the status to `error` and expose the error message.
7. WHEN the component using useStreamingScript unmounts, THE useStreamingScript hook SHALL close the SSE connection via the SSE_Client.

### Requirement 6: Script Review Page Streaming Integration

**User Story:** As a content creator, I want the script editor to progressively render scene blocks as they stream in, so that I can read and understand the script structure while it is still being generated.

#### Acceptance Criteria

1. WHILE the useStreamingScript hook status is `streaming`, THE Script_Review_Page SHALL render each completed Scene_Block in the editor as it arrives, with the final in-progress scene showing a typing indicator.
2. WHILE the useStreamingScript hook status is `streaming`, THE Script_Review_Page SHALL disable the "Approve Script" and "Regenerate" buttons to prevent actions on incomplete output.
3. WHILE the useStreamingScript hook status is `streaming`, THE Script_Review_Page SHALL update the word count and duration metrics in the insights sidebar in real time as text accumulates.
4. WHEN the useStreamingScript hook status transitions to `complete`, THE Script_Review_Page SHALL enable all editing controls and action buttons.
5. IF the useStreamingScript hook status transitions to `error`, THEN THE Script_Review_Page SHALL display an error message with a "Retry" button that re-initiates the streaming generation.
6. WHEN the user lands on the Script_Review_Page and the Pipeline_Job has already completed (status is `script_review`), THE Script_Review_Page SHALL render the full script and scenes loaded from the database without opening an SSE connection.
7. WHEN the user refreshes the Script_Review_Page while generation is in progress, THE Script_Review_Page SHALL reconnect to the Stream_Endpoint via the useStreamingScript hook and seamlessly reconstruct the accumulated script state from replayed catch-up events.

### Requirement 7: Script Stream Event Serialization

**User Story:** As a developer, I want a well-defined schema for stream events, so that the backend and frontend agree on the event format and I can validate events at both ends.

#### Acceptance Criteria

1. THE Script_Stream_Event schema SHALL be defined in the shared package (`@video-ai/shared`) using Zod and exported for use by both the API and web applications.
2. WHEN a `chunk` event is serialized, THE Script_Stream_Event schema SHALL require a `type` field with value `"chunk"` and a `data` field containing a `text` string property.
3. WHEN a `scene` event is serialized, THE Script_Stream_Event schema SHALL require a `type` field with value `"scene"` and a `data` field containing a complete Scene_Block structure (id, name, type, text).
4. WHEN a `done` event is serialized, THE Script_Stream_Event schema SHALL require a `type` field with value `"done"` and a `data` field containing the full `script` string and `scenes` array.
5. WHEN an `error` event is serialized, THE Script_Stream_Event schema SHALL require a `type` field with value `"error"` and a `data` field containing `code` and `message` string properties.
6. FOR ALL valid Script_Stream_Events, serializing to JSON then parsing back with the Zod schema SHALL produce an equivalent object (round-trip property).

### Requirement 8: Event Publishing Channel (Redis Pub/Sub)

**User Story:** As a developer, I want a pub/sub mechanism for the BullMQ worker to publish stream events and the SSE endpoint to subscribe to them, so that the streaming overlay is decoupled from the generation pipeline and generation completes regardless of client connection state.

#### Acceptance Criteria

1. THE Pub_Sub_Channel SHALL use Redis Pub/Sub with a channel name scoped to the Pipeline_Job ID (e.g., `stream:script:<jobId>`), leveraging the existing Redis instance used by BullMQ.
2. WHEN the BullMQ `script_generation` worker begins processing a Pipeline_Job, THE Streaming_Script_Generator SHALL publish each Script_Stream_Event to the Pub_Sub_Channel as the LLM produces output.
3. WHILE the Streaming_Script_Generator is emitting events, THE Streaming_Script_Generator SHALL append each event to the Stream_Event_Buffer (Redis list keyed by job ID) so that late-connecting or reconnecting clients can catch up.
4. WHEN the `done` event is published, THE Streaming_Script_Generator SHALL set a completion flag on the Stream_Event_Buffer so that the Stream_Endpoint can distinguish between an in-progress and a completed generation.
5. THE Stream_Event_Buffer SHALL expire automatically after a configurable TTL (default 1 hour) to avoid unbounded storage growth.
6. IF no SSE clients are subscribed to the Pub_Sub_Channel, THE BullMQ worker SHALL continue publishing events and running to completion — events are simply not consumed.
7. IF the BullMQ worker fails or crashes during generation, THEN THE Streaming_Script_Generator SHALL publish an `error` Script_Stream_Event to the Pub_Sub_Channel and mark the Pipeline_Job as failed.

### Requirement 9: Reconnection and Catch-Up

**User Story:** As a content creator, I want to refresh the page or lose my connection during script generation and still see all the content generated so far plus continue receiving live updates, so that I never lose visibility into the generation progress.

#### Acceptance Criteria

1. WHEN a client connects to the Stream_Endpoint for a job with an active Stream_Event_Buffer, THE Stream_Endpoint SHALL replay all buffered events in order before subscribing to the live Pub_Sub_Channel.
2. WHEN the Stream_Endpoint replays buffered events, THE Stream_Endpoint SHALL include a sequence number on each event so the SSE_Client can detect and discard duplicates during the transition from replay to live.
3. IF the user refreshes the Script_Review_Page while generation is in progress, THEN THE useStreamingScript hook SHALL reconnect to the Stream_Endpoint and reconstruct the accumulated script state from the replayed events seamlessly.
4. WHEN a client connects to the Stream_Endpoint after generation has completed (completion flag is set on the Stream_Event_Buffer), THE Stream_Endpoint SHALL replay the `done` event and close the connection.
5. IF the Stream_Event_Buffer has expired and the Pipeline_Job status is `script_review` or later, THEN THE Stream_Endpoint SHALL fetch the completed script from the Pipeline_Job database record and return it as a single `done` event.

### Requirement 10: Reusable Streaming Infrastructure

**User Story:** As a developer, I want the SSE streaming infrastructure to be generic and reusable, so that I can add streaming to direction generation, code generation, and other LLM-powered features with minimal new code.

#### Acceptance Criteria

1. THE Stream_Endpoint handler SHALL accept a generic event schema and pub/sub channel configuration as parameters, decoupled from any specific LLM call or domain logic.
2. THE SSE_Client SHALL be parameterized by event type schema, allowing different features to define their own event shapes while reusing connection management logic.
3. THE streaming infrastructure (SSE response helper, pub/sub relay, event buffer, client, and hook pattern) SHALL be located in shared modules (`apps/api/src/shared/` for backend, `apps/web/src/shared/` for frontend) rather than within the pipeline feature directory.