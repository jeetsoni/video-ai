# Requirements Document

## Introduction

Add a natural language chat interface to the script review page so users can iteratively refine their video script through conversation. Currently, users must either manually edit text in textareas or fully regenerate the script from scratch. This feature provides a middle ground: users describe changes in plain language (e.g., "make the intro more punchy", "add recent stats about AI", "shorten scene 3") and an AI assistant applies targeted edits to the script text. The feature mirrors the existing video preview tweak chat (ChatPanel + AICodeTweaker) but operates on script text instead of Remotion animation code.

## Glossary

- **Script_Chat_Panel**: The frontend chat UI component embedded in the script review page that allows users to send natural language messages and view AI responses.
- **Script_Tweaker**: The backend AI service that receives a user message, reads the current script, applies targeted text edits via tool calls, and returns the updated script with an explanation.
- **Script_Tweak_Message**: A persisted chat message (user or assistant role) associated with a pipeline job's script tweak conversation, stored in the database.
- **Script_Review_Page**: The existing page where users review, manually edit, and approve their generated video script before proceeding to TTS generation.
- **Pipeline_Job**: The domain entity representing a video generation pipeline run, which holds the generated script and tracks pipeline stage.
- **Scene_Block**: A discrete section of the script corresponding to a single scene, with a heading and body text.
- **Web_Search_Tool**: An optional AI tool that allows the Script_Tweaker to look up current data from the internet when users request facts, statistics, or recent information.

## Requirements

### Requirement 1: Script Chat Panel UI

**User Story:** As a user reviewing my script, I want a chat panel on the script review page, so that I can describe changes in natural language instead of manually rewriting text.

#### Acceptance Criteria

1. WHEN the Script_Review_Page loads for a Pipeline_Job in the "script_review" stage, THE Script_Chat_Panel SHALL render alongside the script editor within the page layout.
2. THE Script_Chat_Panel SHALL display a text input field and a send button for composing messages.
3. WHEN the user submits a message via the send button or the Enter key, THE Script_Chat_Panel SHALL send the message to the backend and display it as a user message bubble.
4. WHEN the Script_Tweaker returns a response, THE Script_Chat_Panel SHALL display the assistant explanation as an assistant message bubble.
5. WHILE a script tweak request is in flight, THE Script_Chat_Panel SHALL display a loading indicator and disable the send button.
6. THE Script_Chat_Panel SHALL auto-scroll to the most recent message when new messages are added.
7. IF the Script_Tweaker returns an error, THEN THE Script_Chat_Panel SHALL display the error as a visually distinct error message bubble.

### Requirement 2: Script Review Page Layout Reorganization

**User Story:** As a user, I want the chat panel to fit naturally into the script review page, so that I can chat and edit without losing access to voice selection and script insights.

#### Acceptance Criteria

1. THE Script_Review_Page SHALL reorganize its layout to accommodate the Script_Chat_Panel alongside the script editor, narration controls, and insights panel.
2. THE Script_Review_Page SHALL preserve access to the voice selector and voice settings controls after the layout reorganization.
3. THE Script_Review_Page SHALL preserve access to the insights panel (word count, duration, tone, density) after the layout reorganization.

### Requirement 3: Send Script Tweak API Endpoint

**User Story:** As a frontend client, I want an API endpoint to send script tweak messages, so that the AI can process my request and return an updated script.

#### Acceptance Criteria

1. WHEN a POST request is received at the script tweak endpoint with a valid job ID and message, THE API SHALL invoke the Script_Tweaker and return the updated script text and an explanation.
2. WHEN a POST request is received with a job ID that does not exist, THE API SHALL return a 404 error response.
3. WHEN a POST request is received for a Pipeline_Job that is not in the "script_review" stage, THE API SHALL return a conflict error response indicating the job is not in the correct stage.
4. WHEN a POST request is received for a Pipeline_Job that has no generated script, THE API SHALL return a 404 error response indicating no script is available to tweak.

### Requirement 4: Script Tweak Message Persistence

**User Story:** As a user, I want my script chat history to be saved, so that I can see previous messages when I return to the script review page.

#### Acceptance Criteria

1. WHEN a user sends a script tweak message, THE API SHALL persist the user message as a Script_Tweak_Message before invoking the Script_Tweaker.
2. WHEN the Script_Tweaker returns a successful response, THE API SHALL persist the assistant explanation as a Script_Tweak_Message.
3. IF the Script_Tweaker returns an error, THEN THE API SHALL persist the error message as an assistant Script_Tweak_Message.
4. WHEN the frontend requests script tweak message history for a Pipeline_Job, THE API SHALL return all Script_Tweak_Messages ordered by creation time.

### Requirement 5: Get Script Tweak Messages API Endpoint

**User Story:** As a frontend client, I want an API endpoint to retrieve script tweak chat history, so that I can display previous messages when the user returns to the page.

#### Acceptance Criteria

1. WHEN a GET request is received at the script tweak messages endpoint with a valid job ID, THE API SHALL return all Script_Tweak_Messages for that Pipeline_Job ordered by creation time ascending.
2. WHEN a GET request is received with a job ID that does not exist, THE API SHALL return a 404 error response.

### Requirement 6: AI Script Tweaker Service

**User Story:** As a system, I want an AI service that can read and edit script text via tool calls, so that user requests are translated into precise script modifications.

#### Acceptance Criteria

1. THE Script_Tweaker SHALL expose a `read_script` tool that returns the current full script text to the AI model.
2. THE Script_Tweaker SHALL expose an `edit_script` tool that replaces an exact substring in the script with a new substring.
3. WHEN the `edit_script` tool receives an `oldStr` that does not exist in the current script, THE Script_Tweaker SHALL return an error message to the AI model indicating the substring was not found.
4. WHEN the `edit_script` tool receives an `oldStr` that matches multiple locations in the script, THE Script_Tweaker SHALL return an error message to the AI model indicating the match is ambiguous.
5. THE Script_Tweaker SHALL include the last 10 Script_Tweak_Messages as conversational context when invoking the AI model.
6. WHEN the AI model completes its tool calls, THE Script_Tweaker SHALL return the modified script text and a plain-language explanation of the changes.
7. IF the AI model fails to modify the script (no edits applied), THEN THE Script_Tweaker SHALL return an error indicating no changes were made.

### Requirement 7: Real-Time Script Editor Update

**User Story:** As a user, I want the script editor to update immediately when the AI makes changes, so that I can see the result of my chat request without refreshing.

#### Acceptance Criteria

1. WHEN the Script_Tweaker returns an updated script, THE Script_Review_Page SHALL update the script editor content to reflect the new script text.
2. WHEN the script editor content is updated via a tweak response, THE Script_Review_Page SHALL recalculate and update the insights panel (word count, duration, tone, density).
3. WHEN the script editor content is updated via a tweak response, THE Script_Review_Page SHALL update the scene blocks to reflect the new scene structure.

### Requirement 8: Web Search Tool for Script Tweaker

**User Story:** As a user, I want the AI to look up current data when I ask for facts or statistics, so that my script contains accurate and up-to-date information.

#### Acceptance Criteria

1. THE Script_Tweaker SHALL expose a `web_search` tool that performs a web search query and returns summarized results to the AI model.
2. WHEN the AI model invokes the `web_search` tool with a query, THE Script_Tweaker SHALL execute the search and return relevant snippets.
3. THE Script_Tweaker SHALL use the web search results to inform script edits when the user requests factual or statistical content.

### Requirement 9: Script Tweak Conversation Context

**User Story:** As a user, I want the AI to remember what we discussed earlier in the conversation, so that I can make follow-up requests without repeating context.

#### Acceptance Criteria

1. WHEN the Script_Tweaker is invoked, THE Script_Tweaker SHALL include up to 10 recent Script_Tweak_Messages as conversational context in the AI model prompt.
2. THE Script_Tweaker SHALL order the conversational context messages by creation time ascending so the AI model receives them in chronological order.

### Requirement 10: Script Update Persistence

**User Story:** As a user, I want my AI-edited script to be saved on the pipeline job, so that the changes persist when I approve the script and proceed to the next pipeline stage.

#### Acceptance Criteria

1. WHEN the Script_Tweaker returns an updated script, THE API SHALL update the Pipeline_Job's generated script field with the new script text.
2. WHEN the Pipeline_Job's generated script is updated via a tweak, THE API SHALL also update the scene boundaries if the script structure has changed.
3. WHEN the user approves the script after tweaking, THE Script_Review_Page SHALL send the latest tweaked script to the approve endpoint.

### Requirement 11: Frontend Chat Hook for Script Tweaks

**User Story:** As a frontend developer, I want a reusable hook for script tweak chat, so that the chat panel can manage message state, API calls, and optimistic updates consistently.

#### Acceptance Criteria

1. THE hook SHALL fetch existing Script_Tweak_Messages on mount and display them in the Script_Chat_Panel.
2. WHEN the user sends a message, THE hook SHALL add an optimistic user message to the message list before the API call completes.
3. WHEN the API returns a successful response, THE hook SHALL add the assistant explanation to the message list and invoke a callback to update the script editor.
4. IF the API returns an error, THEN THE hook SHALL add an error message to the message list and set an error state.
5. THE hook SHALL expose loading state so the Script_Chat_Panel can show a loading indicator during requests.

### Requirement 12: Database Schema for Script Tweak Messages

**User Story:** As a system, I want a dedicated storage mechanism for script tweak messages, so that script chat history is persisted separately from code tweak chat history.

#### Acceptance Criteria

1. THE database schema SHALL include a ScriptTweakMessage model with fields for id, jobId, role, content, and createdAt.
2. THE ScriptTweakMessage model SHALL have a foreign key relationship to the PipelineJob model with cascade delete.
3. THE ScriptTweakMessage model SHALL have an index on jobId and createdAt for efficient query ordering.
