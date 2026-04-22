# Requirements Document

## Introduction

This feature adds progressive/streaming code preview to the video generation pipeline. Currently, the AI generates a complete React component for the entire video, and the frontend waits for the full code before rendering anything. With streaming code preview, the backend streams AI-generated code tokens to the frontend via SSE as they are produced. The frontend accumulates tokens, detects complete `<Sequence>` scene blocks, evaluates partial code up to the last complete scene, and renders those scenes immediately in the Remotion Player — while showing loading placeholders for scenes still being generated. When the full code arrives, the partial render is seamlessly replaced with the complete component. If partial evaluation fails at any point, the system gracefully falls back to waiting for the full code (current behavior).

The AI prompt, model, and generation strategy remain unchanged — only the delivery mechanism (streaming vs batch) and frontend rendering (progressive vs all-at-once) change. Cross-scene visual consistency is preserved because the AI still generates one holistic component from the full ScenePlan.

## Glossary

- **Streaming_Code_Generator**: Backend service that uses the Vercel AI SDK `streamText()` API to stream AI-generated Remotion component code tokens to the frontend via SSE.
- **SSE_Endpoint**: Server-Sent Events endpoint that delivers code tokens and stream lifecycle events to the frontend in real time.
- **Code_Stream_Accumulator**: Frontend module that receives SSE events and accumulates streamed tokens into a growing code string.
- **Sequence_Block_Parser**: Frontend module that analyzes accumulated code to detect complete `<Sequence>` scene blocks by tracking JSX bracket depth.
- **Partial_Code_Assembler**: Frontend module that takes code up to the last complete `</Sequence>` tag, prepends any preamble (helper functions, shared style constants), appends closing tags (`</AbsoluteFill>\n}\n`), and produces an evaluable partial code string.
- **Code_Evaluator**: Existing frontend module that transpiles JSX/TSX code via sucrase and evaluates it using `new Function()` with an allow-list of globals, producing a React component.
- **Remotion_Player**: Existing `@remotion/player` wrapper component that renders evaluated React components with frame-accurate playback.
- **Scene_Placeholder**: A visual loading indicator rendered in the Remotion Player for scenes whose code has not yet been fully streamed.
- **Preamble**: The portion of the generated code before the JSX return statement, including helper functions, shared style constants, and variable declarations that must be included in every partial evaluation.
- **ScenePlan**: The full scene plan JSON containing all scenes with beats, timing, and design tokens, provided to the AI for holistic code generation.

## Requirements

### Requirement 1: Stream Code Tokens from Backend

**User Story:** As a user, I want the backend to stream AI-generated code tokens to my browser as they are produced, so that I can see preview progress before the full code generation completes.

#### Acceptance Criteria

1. WHEN a code generation job starts, THE Streaming_Code_Generator SHALL use the Vercel AI SDK `streamText()` API instead of `generateText()` to produce code tokens incrementally.
2. WHEN `streamText()` produces a text delta, THE SSE_Endpoint SHALL emit an SSE event of type `chunk` containing the text delta to the connected client within 100ms of receiving the delta.
3. WHEN the full code generation completes successfully, THE SSE_Endpoint SHALL emit an SSE event of type `done` containing the complete final code string.
4. IF the AI model returns an error during streaming, THEN THE SSE_Endpoint SHALL emit an SSE event of type `error` containing a descriptive error message and close the connection.
5. IF the SSE connection is closed by the client before code generation completes, THEN THE Streaming_Code_Generator SHALL abort the `streamText()` call to avoid wasted computation.
6. THE Streaming_Code_Generator SHALL use the same AI model, prompt, temperature, and system prompt as the existing `AICodeGenerator` — only the delivery mechanism changes from batch to streaming.
7. WHEN the full code generation completes, THE Streaming_Code_Generator SHALL validate that the generated code contains a `Main` function before emitting the `done` event.
8. IF the generated code does not contain a `Main` function after streaming completes, THEN THE Streaming_Code_Generator SHALL retry code generation up to the configured `maxRetries` count, streaming each attempt.

### Requirement 2: Frontend Code Stream Consumption

**User Story:** As a user, I want my browser to receive and accumulate streamed code tokens in real time, so that the system can progressively evaluate and render scenes.

#### Acceptance Criteria

1. WHEN the pipeline job enters the `code_generation` stage, THE Code_Stream_Accumulator SHALL open an SSE connection to the streaming endpoint for the job.
2. WHEN a `chunk` SSE event is received, THE Code_Stream_Accumulator SHALL append the text delta to the accumulated code string.
3. WHEN a `done` SSE event is received, THE Code_Stream_Accumulator SHALL replace the accumulated code string with the final complete code from the event payload.
4. IF the SSE connection fails or drops unexpectedly, THEN THE Code_Stream_Accumulator SHALL set the stream status to `error` and expose a descriptive error message.
5. WHEN the component consuming the stream unmounts, THE Code_Stream_Accumulator SHALL close the SSE connection and cancel any pending processing.

### Requirement 3: Detect Complete Scene Sequence Blocks

**User Story:** As a user, I want the system to detect when complete scene blocks have been streamed, so that those scenes can be rendered immediately.

#### Acceptance Criteria

1. WHEN the accumulated code string changes, THE Sequence_Block_Parser SHALL analyze the code to identify complete `<Sequence>` blocks by tracking JSX open/close tag depth.
2. THE Sequence_Block_Parser SHALL consider a `<Sequence>` block complete only when its corresponding closing `</Sequence>` tag is found and all nested JSX tags within the block are balanced.
3. WHEN a new complete `<Sequence>` block is detected, THE Sequence_Block_Parser SHALL report the updated count of complete scene blocks.
4. THE Sequence_Block_Parser SHALL return the character index of the end of the last complete `</Sequence>` tag in the accumulated code.
5. IF the accumulated code contains zero complete `<Sequence>` blocks, THEN THE Sequence_Block_Parser SHALL report zero complete scenes and a null end index.

### Requirement 4: Assemble Evaluable Partial Code

**User Story:** As a user, I want the system to construct valid partial code from incomplete streams, so that completed scenes can be evaluated and rendered.

#### Acceptance Criteria

1. WHEN at least one complete `<Sequence>` block is detected, THE Partial_Code_Assembler SHALL construct an evaluable code string by combining the preamble, the code up to the end of the last complete `</Sequence>` tag, and the closing tags `</AbsoluteFill>\n}\n`.
2. THE Partial_Code_Assembler SHALL extract the preamble (all code from the start of the `Main` function body up to the JSX return statement) and include it in every partial code assembly.
3. THE Partial_Code_Assembler SHALL include the `function Main({ scenePlan }) {` declaration and the opening lines (frame, fps, constants) in every partial code assembly.
4. THE Partial_Code_Assembler SHALL produce a syntactically valid JavaScript function that can be evaluated by the Code_Evaluator.
5. WHEN the accumulated code does not yet contain any complete `<Sequence>` blocks, THE Partial_Code_Assembler SHALL return null to indicate no partial code is available.

### Requirement 5: Progressive Scene Rendering

**User Story:** As a user, I want to see completed scenes rendered in the Remotion Player immediately while remaining scenes show loading placeholders, so that I get visual feedback during code generation.

#### Acceptance Criteria

1. WHEN the Partial_Code_Assembler produces a valid partial code string, THE Code_Evaluator SHALL evaluate the partial code and produce a React component rendering the completed scenes.
2. WHEN a partial component is successfully evaluated, THE Remotion_Player SHALL render the completed scenes using the partial component.
3. WHILE scenes are still being streamed, THE Remotion_Player SHALL display a Scene_Placeholder for each scene in the ScenePlan that has not yet been included in the evaluated partial code.
4. THE Scene_Placeholder SHALL display within the correct frame range for the pending scene, matching the scene's `startFrame` and `durationFrames` from the ScenePlan.
5. WHEN a new `<Sequence>` block completes and the partial code is re-evaluated, THE Remotion_Player SHALL update to render the newly completed scene and remove its placeholder.
6. WHEN the `done` event is received and the full code is evaluated, THE Remotion_Player SHALL seamlessly replace the partial component with the full component.

### Requirement 6: Graceful Fallback on Partial Evaluation Failure

**User Story:** As a user, I want the system to fall back to the current all-at-once rendering behavior if partial evaluation fails, so that I always get a working preview.

#### Acceptance Criteria

1. IF the Code_Evaluator returns an error when evaluating partial code, THEN THE Remotion_Player SHALL discard the failed partial result and continue showing placeholders for all scenes.
2. IF partial evaluation fails, THEN THE Code_Stream_Accumulator SHALL continue accumulating tokens and the system SHALL attempt partial evaluation again when the next `<Sequence>` block completes.
3. WHEN the `done` event is received after partial evaluation failures, THE Code_Evaluator SHALL evaluate the full final code and THE Remotion_Player SHALL render the complete component.
4. IF the full final code also fails evaluation, THEN THE Remotion_Player SHALL display an error state with a descriptive message and a retry button.

### Requirement 7: Streaming Endpoint and API Integration

**User Story:** As a developer, I want a dedicated SSE endpoint for code streaming that follows the existing streaming patterns in the codebase, so that the implementation is consistent and maintainable.

#### Acceptance Criteria

1. THE SSE_Endpoint SHALL be accessible at `GET /api/pipeline/jobs/:id/code-stream`.
2. THE SSE_Endpoint SHALL set the response headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive`.
3. THE SSE_Endpoint SHALL validate that the job exists and is in the `code_generation` stage before starting the stream.
4. IF the job is not found, THEN THE SSE_Endpoint SHALL respond with HTTP 404.
5. IF the job is not in the `code_generation` stage, THEN THE SSE_Endpoint SHALL respond with HTTP 400 with a descriptive error message.
6. THE SSE_Endpoint SHALL follow the same SSE event format as the existing script streaming endpoint (`/api/pipeline/jobs/:id/stream`).

### Requirement 8: Preserve Existing Non-Streaming Code Path

**User Story:** As a developer, I want the existing batch code generation and preview flow to remain functional as a fallback, so that the system is resilient to streaming failures.

#### Acceptance Criteria

1. THE existing `GET /api/pipeline/jobs/:id/preview` endpoint SHALL continue to return the full generated code after code generation completes.
2. WHEN the frontend cannot establish an SSE connection for code streaming, THE system SHALL fall back to the existing behavior of fetching the full code from the preview endpoint after the job reaches the `preview` stage.
3. THE existing `CodeGenerator` interface and `AICodeGenerator` implementation SHALL remain unchanged — the Streaming_Code_Generator SHALL be a separate implementation.

### Requirement 9: Stream Lifecycle State Management

**User Story:** As a user, I want clear visual feedback about the streaming state, so that I understand what the system is doing at each moment.

#### Acceptance Criteria

1. WHILE the SSE connection is being established, THE Code_Stream_Accumulator SHALL report a status of `connecting`.
2. WHILE code tokens are being received, THE Code_Stream_Accumulator SHALL report a status of `streaming`.
3. WHEN the `done` event is received, THE Code_Stream_Accumulator SHALL report a status of `complete`.
4. IF an error occurs during streaming, THEN THE Code_Stream_Accumulator SHALL report a status of `error`.
5. WHILE the status is `streaming`, THE video preview page SHALL display a visual indicator showing that code generation is in progress and the number of scenes completed so far.
