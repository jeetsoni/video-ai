# Bugfix Requirements Document

## Introduction

When a user refreshes the page during the `code_generation` stage, the SSE connection drops and per-scene progress (which scenes are generating, completed, or failed — along with their generated code) is lost. The UI falls back to a generic "code_generation/processing" state with no scene-level detail. This happens because scene progress events are published exclusively via Redis pub/sub, which is ephemeral — events published while no subscriber is listening are discarded. The existing `RedisStreamEventPublisher.buffer()` infrastructure (used for script streaming) is not utilized for scene progress events, so there is nothing to replay on reconnect.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user refreshes the page during `code_generation` stage while scenes are being generated THEN the system loses all per-scene progress information (scene statuses and completed scene codes) because Redis pub/sub events published during the disconnection window are discarded

1.2 WHEN the SSE connection is re-established after a page refresh during `code_generation` THEN the system only sends the job-level state from the database (stage: "code_generation", status: "processing") with no `sceneProgress` data, because the `ProgressController` does not replay buffered scene progress events

1.3 WHEN scene progress events are published by the `CodeGenerationWorker` THEN the system only publishes them to the Redis pub/sub channel (`stream:progress:{jobId}`) without buffering them to a Redis list, so no historical record of scene progress exists for replay

### Expected Behavior (Correct)

2.1 WHEN the user refreshes the page during `code_generation` stage while scenes are being generated THEN the system SHALL restore all per-scene progress information including each scene's status (generating/completed/failed) and any completed scene code, so the UI displays the same scene-by-scene detail that was visible before the refresh

2.2 WHEN the SSE connection is re-established after a page refresh during `code_generation` THEN the system SHALL replay all buffered scene progress events before subscribing to live pub/sub events, so the client receives the complete history of scene progress followed by any new real-time updates

2.3 WHEN scene progress events are published by the `CodeGenerationWorker` THEN the system SHALL buffer each scene progress event to a durable Redis list (in addition to publishing via pub/sub) so that the events survive subscriber disconnections and can be replayed on reconnect

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user is connected via SSE during `code_generation` without any page refresh THEN the system SHALL CONTINUE TO deliver real-time scene progress events (generating, completed with code, failed) via pub/sub as they occur

3.2 WHEN the job reaches a terminal status (completed or failed) THEN the system SHALL CONTINUE TO close the SSE connection and end the stream normally

3.3 WHEN the user connects to the SSE progress endpoint for a job that is NOT in `code_generation` stage (e.g., script_generation, rendering, done) THEN the system SHALL CONTINUE TO send the job-level progress from the database and subscribe to pub/sub without attempting scene progress replay

3.4 WHEN script generation streaming is in progress THEN the system SHALL CONTINUE TO use its existing buffer/replay mechanism independently and without interference from the new scene progress buffering

3.5 WHEN the `code_generation` stage completes and the job transitions to `preview` THEN the system SHALL CONTINUE TO publish the stage transition event and the buffered scene progress data SHALL expire after a reasonable TTL
