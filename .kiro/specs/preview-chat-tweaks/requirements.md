# Requirements Document

## Introduction

Add a conversational chat interface to the video preview page that lets users request animation tweaks in natural language. When the user sends a message, the system captures a screenshot of the current Remotion player frame along with the timeline position, then sends this visual and temporal context to an AI agent. The agent reads the current composed Remotion code via `read_code`/`edit_code` tools and makes surgical edits. After each successful tweak, the updated code is persisted to the database and the frontend re-evaluates it so the Remotion player reflects changes instantly.

This feature mirrors the existing autofix flow but is driven by user conversation rather than error messages. Chat history is stored in the database and the last 10 messages are sent to the LLM for context.

## Glossary

- **Chat_Panel**: The UI component that replaces the existing info/actions section in the right column of the preview page, providing a message list, input field, and compact job metadata.
- **Tweak_Message**: A single user or assistant entry in the chat conversation, stored in the database and displayed in the Chat_Panel.
- **Tweak_Agent**: The backend AI service that receives the user's message, screenshot, timeline position, and current code, then uses `read_code`/`edit_code` tools to make surgical code edits.
- **Screenshot_Capture**: The client-side process that captures the full Remotion player viewport as a PNG image at the user's current timeline position.
- **Chat_History_Table**: A new database table linked to a PipelineJob that stores the ordered sequence of Tweak_Messages for a conversation.
- **Code_Evaluator**: The existing frontend utility (`evaluateComponentCode`) that transpiles and evaluates Remotion code into a live React component.
- **Preview_Page**: The `VideoPreviewPage` component with a two-column layout (video left, info/chat right).
- **Pipeline_Job**: The existing `PipelineJob` database record that holds all pipeline artifacts including `generatedCode`.
- **Preview_Eligible_Stage**: One of the pipeline stages `preview`, `rendering`, or `done` — the stages where the Remotion player is shown.

## Requirements

### Requirement 1: Chat History Persistence

**User Story:** As a user, I want my tweak conversation to be saved, so that I can see previous messages when I return to the preview page.

#### Acceptance Criteria

1. WHEN a user sends a Tweak_Message, THE Chat_History_Table SHALL store the message with its role (user or assistant), content text, and a timestamp linked to the Pipeline_Job.
2. WHEN the Preview_Page loads for a Pipeline_Job that has existing Tweak_Messages, THE Chat_Panel SHALL display the stored messages in chronological order.
3. THE Chat_History_Table SHALL support storing at least the following fields per message: id, jobId, role, content, createdAt.
4. WHEN the Tweak_Agent produces a response, THE Chat_History_Table SHALL store the assistant message with the explanation of changes made.

### Requirement 2: Chat Context Window

**User Story:** As a developer, I want only the last 10 messages sent to the LLM, so that we control token usage and cost while maintaining relevant context.

#### Acceptance Criteria

1. WHEN the Tweak_Agent is invoked, THE Tweak_Agent SHALL include at most the 10 most recent Tweak_Messages (ordered chronologically) from the Chat_History_Table as conversation context.
2. WHEN the Chat_History_Table contains fewer than 10 messages for a Pipeline_Job, THE Tweak_Agent SHALL include all available messages.
3. THE Tweak_Agent SHALL always include the system prompt regardless of the message count.

### Requirement 3: Screenshot Capture

**User Story:** As a user, I want the AI to see what I'm looking at in the preview, so that it understands which visual element I'm referring to.

#### Acceptance Criteria

1. WHEN the user sends a Tweak_Message, THE Screenshot_Capture SHALL capture the full Remotion player viewport as a single PNG image at the user's current timeline frame.
2. THE Screenshot_Capture SHALL encode the captured image as a base64 PNG string without the `data:image/png;base64,` prefix.
3. IF the Screenshot_Capture fails to produce an image, THEN THE Chat_Panel SHALL still send the Tweak_Message to the backend without the screenshot, allowing the Tweak_Agent to operate on code context alone.

### Requirement 4: Timeline Context

**User Story:** As a user, I want the AI to know which point in the video I'm viewing, so that it can identify the correct scene or beat for my tweak request.

#### Acceptance Criteria

1. WHEN the user sends a Tweak_Message, THE Chat_Panel SHALL read the current frame number and computed time (in seconds) from the Remotion PlayerRef.
2. THE Chat_Panel SHALL send the current frame number and time alongside the Tweak_Message and screenshot to the backend API.
3. WHEN the Tweak_Agent receives timeline context, THE Tweak_Agent SHALL include the frame number and time in the prompt so the LLM can correlate the user's request with the relevant section of code.

### Requirement 5: Tweak Agent Code Editing

**User Story:** As a user, I want the AI to make precise edits to my animation code based on my request, so that I can iterate on the visual design conversationally.

#### Acceptance Criteria

1. WHEN the Tweak_Agent receives a tweak request, THE Tweak_Agent SHALL first call `read_code` to retrieve the current composed Remotion code from the Pipeline_Job.
2. THE Tweak_Agent SHALL use `edit_code` to make surgical string-replacement edits to the code, matching the pattern established by the existing `AICodeAutoFixer` service.
3. THE Tweak_Agent SHALL use the `gemini-3-flash-preview` model, consistent with the existing autofix service.
4. THE Tweak_Agent SHALL accept the base64 PNG screenshot as an image content part in the LLM request, providing visual context for the edit.
5. IF the Tweak_Agent's edits result in code that no longer contains a `Main` function, THEN THE Tweak_Agent SHALL return an error indicating the code structure was broken.
6. THE Tweak_Agent SHALL limit tool-use steps to a maximum of 10 per tweak request.

### Requirement 6: Auto-Save and Live Reload After Tweak

**User Story:** As a user, I want to see my tweak applied instantly in the preview player, so that I get immediate visual feedback.

#### Acceptance Criteria

1. WHEN the Tweak_Agent completes a successful edit, THE backend SHALL update the Pipeline_Job's `generatedCode` field with the tweaked code.
2. WHEN the backend returns the tweaked code to the frontend, THE Preview_Page SHALL re-evaluate the code using the Code_Evaluator and update the Remotion player component without a full page reload.
3. WHEN the Tweak_Agent returns an error, THE Chat_Panel SHALL display the error as an assistant message and SHALL NOT update the Pipeline_Job's code.

### Requirement 7: Chat API Endpoint

**User Story:** As a frontend developer, I want a dedicated API endpoint for sending tweak messages, so that the chat feature has a clean integration point.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /jobs/:id/tweak` endpoint that accepts a JSON body with the user's message text, an optional base64 screenshot, and optional timeline context (frame number and time in seconds).
2. WHEN the `POST /jobs/:id/tweak` endpoint receives a request, THE API SHALL validate that the Pipeline_Job exists and is in a Preview_Eligible_Stage (preview, rendering, or done).
3. WHEN the Pipeline_Job is not in a Preview_Eligible_Stage, THE API SHALL return an appropriate error response indicating the job is not eligible for tweaks.
4. WHEN the tweak is successful, THE API SHALL return the updated code and the assistant's explanation message.
5. THE API SHALL expose a `GET /jobs/:id/tweak/messages` endpoint that returns the full chat history for a Pipeline_Job in chronological order.

### Requirement 8: Chat Panel UI

**User Story:** As a user, I want a chat interface in the preview page where I can type tweak requests and see AI responses, so that I can iterate on my animation design conversationally.

#### Acceptance Criteria

1. WHEN the Pipeline_Job is in a Preview_Eligible_Stage, THE Preview_Page SHALL display the Chat_Panel in the right column, replacing the existing info/actions section.
2. THE Chat_Panel SHALL display job metadata (format, resolution, theme, created date) in a compact layout above the chat messages.
3. THE Chat_Panel SHALL display the stage indicator and progress bar in a compact form.
4. THE Chat_Panel SHALL keep action buttons (Download, Regenerate, Export) accessible within the panel layout.
5. THE Chat_Panel SHALL display a scrollable message list showing all Tweak_Messages with visual distinction between user and assistant messages.
6. THE Chat_Panel SHALL provide a text input field with a send button at the bottom of the panel.
7. WHILE a tweak request is being processed, THE Chat_Panel SHALL display a loading indicator on the assistant's pending message.
8. WHEN the Pipeline_Job is not in a Preview_Eligible_Stage, THE Preview_Page SHALL display the existing info/actions layout without the Chat_Panel.

### Requirement 9: Chat Panel Scroll Behavior

**User Story:** As a user, I want the chat to automatically scroll to the latest message, so that I always see the most recent response.

#### Acceptance Criteria

1. WHEN a new Tweak_Message is added to the Chat_Panel (user or assistant), THE Chat_Panel SHALL auto-scroll the message list to the bottom.
2. WHEN the Chat_Panel loads with existing messages, THE Chat_Panel SHALL scroll to the most recent message.

### Requirement 10: Frontend Repository Integration

**User Story:** As a frontend developer, I want the tweak API calls to follow the existing repository pattern, so that the codebase stays consistent.

#### Acceptance Criteria

1. THE PipelineRepository interface SHALL define a `sendTweak` method that accepts a jobId, message text, optional base64 screenshot, and optional timeline context (frame and timeSeconds), and returns the updated code and assistant explanation.
2. THE PipelineRepository interface SHALL define a `getTweakMessages` method that accepts a jobId and returns the list of Tweak_Messages.
3. THE implementation of `sendTweak` SHALL call the `POST /jobs/:id/tweak` endpoint.
4. THE implementation of `getTweakMessages` SHALL call the `GET /jobs/:id/tweak/messages` endpoint.
