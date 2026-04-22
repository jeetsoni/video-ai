# Implementation Plan: Preview Chat Tweaks

## Overview

Add a conversational chat interface to the video preview page. The implementation follows the existing clean architecture layers: database schema → domain/application interfaces → infrastructure services → API routes → frontend repository → hooks → UI components. Each task builds incrementally on the previous, with tests placed close to the code they validate.

## Tasks

- [x] 1. Add TweakMessage Prisma model and migrate the database
  - Add a `TweakMessage` model to the Prisma schema with fields: `id` (UUID), `createdAt` (DateTime), `jobId` (String FK to PipelineJob), `role` (String), `content` (Text)
  - Add `@@index([jobId, createdAt])` for efficient chronological queries
  - Add a `tweakMessages TweakMessage[]` reverse relation on the `PipelineJob` model
  - Run `npx prisma migrate dev` to generate and apply the migration
  - _Requirements: 1.1, 1.3_

- [x] 2. Create backend interfaces and repository for TweakMessage
  - [x] 2.1 Define `TweakMessageRepository` interface in `apps/api/src/pipeline/domain/interfaces/repositories/`
    - `findByJobId(jobId: string): Promise<TweakMessage[]>` — all messages in chronological order
    - `findRecentByJobId(jobId: string, limit: number): Promise<TweakMessage[]>` — N most recent messages
    - `create(params: { jobId: string; role: string; content: string }): Promise<TweakMessage>`
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 2.2 Define `TweakMessageDto` in the shared package (`packages/shared/src/`)
    - Interface with `id`, `jobId`, `role` ("user" | "assistant"), `content`, `createdAt` (ISO string)
    - Export from the shared package index
    - _Requirements: 1.3_

  - [x] 2.3 Implement `PrismaTweakMessageRepository` in `apps/api/src/pipeline/infrastructure/repositories/`
    - Implement all three methods using Prisma client
    - `findByJobId` orders by `createdAt` ascending
    - `findRecentByJobId` orders by `createdAt` descending, takes `limit`, then reverses to chronological order
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 2.4 Write property test: Message persistence round-trip (Property 1)
    - **Property 1: Message persistence round-trip**
    - For any valid role and non-empty content, storing and retrieving should return matching role, content, and jobId
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 2.5 Write property test: Chat history chronological ordering (Property 2)
    - **Property 2: Chat history chronological ordering**
    - For any set of messages with varying timestamps, `findByJobId` returns them sorted ascending by `createdAt`
    - **Validates: Requirements 1.2**

- [x] 3. Create the CodeTweaker interface and AICodeTweaker service
  - [x] 3.1 Define `CodeTweaker` interface in `apps/api/src/pipeline/application/interfaces/`
    - `CodeTweakParams`: `currentCode`, `message`, optional `screenshot` (base64), optional `currentFrame`, optional `currentTimeSeconds`, `chatHistory` (TweakMessageDto[])
    - `CodeTweakResult`: `tweakedCode`, `explanation`
    - `tweakCode(params: CodeTweakParams): Promise<Result<CodeTweakResult, PipelineError>>`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.2 Implement `AICodeTweaker` in `apps/api/src/pipeline/infrastructure/services/`
    - Mirror `AICodeAutoFixer` structure: `generateText` from AI SDK with `gemini-3-flash-preview`
    - Create `read_code`/`edit_code` tools using the same `createCodeEditorTools` factory pattern from `ai-code-autofixer.ts`
    - Build system prompt adapted from the existing `AUTOFIX_SYSTEM_PROMPT`, adding instructions for conversational tweaks with visual/temporal context
    - Build multi-part user message: text prompt with frame/time info + optional image content part (base64 PNG screenshot)
    - Map `chatHistory` to prior AI SDK messages for conversational context
    - Use `stepCountIs(10)` as the stop condition
    - Validate `Main` function still exists after edits; return error if missing
    - Return error if no changes were made to the code
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 3.3 Write property test: Context window bounds (Property 3)
    - **Property 3: Context window bounds**
    - For any chat history of length N, the context sent to the LLM should contain exactly `min(N, 10)` messages, being the most recent when N > 10
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 3.4 Write property test: Screenshot base64 prefix stripping (Property 4)
    - **Property 4: Screenshot base64 prefix stripping**
    - For any base64 string with or without `data:image/png;base64,` prefix, the stripping function should correctly handle both cases
    - **Validates: Requirements 3.2**

  - [ ]* 3.5 Write property test: Code edit correctness — applyEdit (Property 5)
    - **Property 5: Code edit correctness (applyEdit)**
    - For any code string and unique substring, `applyEdit` should produce correct replacement with unchanged surrounding text and correct result length
    - **Validates: Requirements 5.2**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create SendTweak and GetTweakMessages use cases
  - [x] 5.1 Implement `SendTweakUseCase` in `apps/api/src/pipeline/application/use-cases/`
    - Accept `jobId`, `message`, optional `screenshot`, optional `frame`, optional `timeSeconds`
    - Validate job exists and is in a preview-eligible stage (`preview`, `rendering`, or `done`)
    - Persist user message to `TweakMessageRepository`
    - Fetch last 10 messages for context via `findRecentByJobId`
    - Retrieve current `generatedCode` from the job
    - Call `AICodeTweaker.tweakCode()` with all context
    - On success: update `PipelineJob.generatedCode`, persist assistant message with explanation, return result
    - On failure: persist assistant error message, return error without updating job code
    - Follow the `AutofixCodeUseCase` pattern for structure and error handling
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 5.1, 6.1, 6.3, 7.2, 7.3_

  - [x] 5.2 Implement `GetTweakMessagesUseCase` in `apps/api/src/pipeline/application/use-cases/`
    - Accept `jobId`, validate job exists
    - Fetch all messages via `TweakMessageRepository.findByJobId()`
    - Map to `TweakMessageDto[]` and return
    - _Requirements: 1.2, 7.5_

  - [ ]* 5.3 Write property test: Stage validation for tweak eligibility (Property 6)
    - **Property 6: Stage validation for tweak eligibility**
    - For any pipeline stage, the use case should accept only `preview`, `rendering`, or `done`, and reject all others
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 5.4 Write unit tests for SendTweakUseCase
    - Test with mocked repository and tweaker: verify message persistence order, code update on success, no code update on failure, error for non-preview stages
    - _Requirements: 1.1, 1.4, 6.1, 6.3, 7.2, 7.3_

- [x] 6. Add API routes and controller methods
  - [x] 6.1 Add controller methods to `PipelineController`
    - `sendTweak(req, res)`: parse body `{ message, screenshot?, frame?, timeSeconds? }`, validate `message` is present, call `SendTweakUseCase`, return `{ status: "ok", updatedCode, explanation }` on success or appropriate error response
    - `getTweakMessages(req, res)`: parse `jobId` from params, call `GetTweakMessagesUseCase`, return `{ messages: TweakMessageDto[] }`
    - _Requirements: 7.1, 7.4, 7.5_

  - [x] 6.2 Register routes in `pipeline.routes.ts`
    - `POST /jobs/:id/tweak` → `controller.sendTweak`
    - `GET /jobs/:id/tweak/messages` → `controller.getTweakMessages`
    - _Requirements: 7.1, 7.5_

  - [x] 6.3 Wire up dependencies in the controller factory
    - Instantiate `PrismaTweakMessageRepository`, `AICodeTweaker`, `SendTweakUseCase`, `GetTweakMessagesUseCase`
    - Inject into the controller
    - _Requirements: 7.1_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise. 

- [x] 8. Extend frontend PipelineRepository with tweak methods
  - [x] 8.1 Add tweak types to `pipeline.types.ts`
    - `SendTweakParams`: `{ jobId: string; message: string; screenshot?: string; frame?: number; timeSeconds?: number }`
    - `SendTweakResponse`: `{ status: "ok"; updatedCode: string; explanation: string }`
    - Import `TweakMessageDto` from `@video-ai/shared`
    - _Requirements: 10.1, 10.2_

  - [x] 8.2 Add methods to `PipelineRepository` interface
    - `sendTweak(params: SendTweakParams): Promise<SendTweakResponse>`
    - `getTweakMessages(jobId: string): Promise<TweakMessageDto[]>`
    - _Requirements: 10.1, 10.2_

  - [x] 8.3 Implement methods in `HttpPipelineRepository`
    - `sendTweak`: POST to `/api/pipeline/jobs/${jobId}/tweak` with message, screenshot, frame, timeSeconds
    - `getTweakMessages`: GET from `/api/pipeline/jobs/${jobId}/tweak/messages`, extract `.messages` from response
    - Follow the existing `autofixCode` pattern for request structure
    - _Requirements: 10.3, 10.4_

- [x] 9. Create screenshot capture utility
  - Create `capturePlayerScreenshot` function in `apps/web/src/features/pipeline/utils/screenshot-capture.ts`
  - Accept a `RefObject<HTMLElement>` for the Remotion player container
  - Use `html2canvas` to capture the container element as a PNG
  - Return base64 string without the `data:image/png;base64,` prefix
  - Return `null` on any failure (graceful degradation)
  - Log a warning to console on failure
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 10. Create `useTweakChat` hook
  - Create `apps/web/src/features/pipeline/hooks/use-tweak-chat.ts`
  - Fetch initial messages on mount via `repository.getTweakMessages(jobId)`
  - Provide `sendMessage(text)` function that:
    1. Captures screenshot from the player container ref via `capturePlayerScreenshot`
    2. Reads current frame/time from the Remotion `PlayerRef`
    3. Adds optimistic user message to local state
    4. Calls `repository.sendTweak({ jobId, message, screenshot, frame, timeSeconds })`
    5. On success: adds assistant message to local state, calls `onCodeUpdated` callback
    6. On error: adds error message to chat, allows retry
  - Manage `isLoading`, `error` states
  - Accept `onCodeUpdated` callback prop for triggering preview re-evaluation
  - _Requirements: 1.2, 3.1, 3.3, 4.1, 4.2, 6.2, 9.1_

- [x] 11. Expose PlayerRef from RemotionPreviewPlayer
  - Update `RemotionPreviewPlayer` to forward the internal `playerRef` via `React.forwardRef` or an `onPlayerRef` callback prop
  - This allows `VideoPreviewPage` to pass the ref to `useTweakChat` for reading frame position and to `capturePlayerScreenshot` for the player container
  - _Requirements: 4.1, 4.2_

- [x] 12. Build the ChatPanel component
  - [x] 12.1 Create `ChatPanel` component in `apps/web/src/features/pipeline/components/chat-panel.tsx`
    - Compact job metadata bar: format, resolution, theme, created date (reuse existing summary card layout)
    - Stage indicator + progress bar (compact version of existing stage display)
    - Action buttons row: Download/Export, Regenerate (compact, horizontal layout)
    - Scrollable message list with user/assistant message bubbles, visually distinct by role
    - Text input with send button at the bottom
    - Loading indicator (spinner on pending assistant message) while tweak is processing
    - Auto-scroll to bottom on new messages and on initial load
    - Accept props: `job`, `repository`, `playerRef`, `playerContainerRef`, `onCodeUpdated`, `onExport`, `onRegenerate`
    - Wire up `useTweakChat` hook internally
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2_

  - [ ]* 12.2 Write unit tests for ChatPanel
    - Test conditional rendering based on preview-eligible stage
    - Test message list renders user and assistant messages with visual distinction
    - Test input field and send button presence
    - Test loading state display
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

- [x] 13. Integrate ChatPanel into VideoPreviewPage
  - In `VideoPreviewPage`, conditionally render `ChatPanel` in the right column when `isPreviewEligible` is true, replacing the existing info/actions section
  - Pass `playerRef` and player container ref from `RemotionPreviewPlayer` to `ChatPanel`
  - On successful tweak (`onCodeUpdated`), call `usePreviewData.refetch()` to re-evaluate the updated code in the Remotion player
  - Keep existing info/actions layout for non-preview-eligible stages (unchanged behavior)
  - Preserve existing `handleAutofixForPlayer` and `handleRegenerateCode` as action buttons within the ChatPanel
  - _Requirements: 8.1, 8.4, 8.8, 6.2_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript throughout (React/Next.js frontend, Express backend, Prisma ORM)
