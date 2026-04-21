# Tasks: Script Chat

## Task 1: Database Schema — ScriptTweakMessage Model

- [ ] 1.1 Add `ScriptTweakMessage` model to `apps/api/prisma/schema.prisma` with fields: `id` (uuid, default), `createdAt` (DateTime, default now), `jobId` (String, FK to PipelineJob with cascade delete), `role` (String), `content` (String, @db.Text), and composite index on `[jobId, createdAt]`
- [ ] 1.2 Add `scriptTweakMessages ScriptTweakMessage[]` relation field to the `PipelineJob` model
- [ ] 1.3 Run `npx prisma migrate dev --name add-script-tweak-message` to generate and apply the migration
- [ ] 1.4 Verify the migration was created and Prisma client was regenerated

## Task 2: Backend Domain & Repository — ScriptTweakMessage

- [ ] 2.1 Create `ScriptTweakMessageRepository` interface at `apps/api/src/pipeline/domain/interfaces/repositories/script-tweak-message-repository.ts` with `findByJobId`, `findRecentByJobId`, and `create` methods (mirror `TweakMessageRepository`)
- [ ] 2.2 Create `PrismaScriptTweakMessageRepository` at `apps/api/src/pipeline/infrastructure/repositories/prisma-script-tweak-message.repository.ts` implementing the interface using `prisma.scriptTweakMessage` (mirror `PrismaTweakMessageRepository`)
- [ ] 2.3 Add `updateGeneratedScript(script: string): void` method to `PipelineJob` entity at `apps/api/src/pipeline/domain/entities/pipeline-job.ts` (mirrors `updateGeneratedCode`)

## Task 3: Backend Application — ScriptTweaker Interface

- [ ] 3.1 Create `ScriptTweaker` interface at `apps/api/src/pipeline/application/interfaces/script-tweaker.ts` with `ScriptTweakParams` (currentScript, message, chatHistory), `ScriptTweakResult` (tweakedScript, explanation), and `tweakScript` method returning `Result<ScriptTweakResult, PipelineError>`

## Task 4: Backend Infrastructure — AIScriptTweaker Service

- [ ] 4.1 Create `AIScriptTweaker` class at `apps/api/src/pipeline/infrastructure/services/ai-script-tweaker.ts` implementing `ScriptTweaker` interface
- [ ] 4.2 Implement `read_script` tool that returns the current full script text
- [ ] 4.3 Implement `edit_script` tool using the same `applyEdit` logic as `AICodeTweaker` (exact substring replacement with not-found and ambiguous-match error handling)
- [ ] 4.4 Implement `web_search` tool that performs a web search query and returns summarized snippets to the AI model
- [ ] 4.5 Write the script-editing system prompt instructing the AI to make surgical text edits, preserve scene structure, call `read_script` first, and provide short plain-language explanations
- [ ] 4.6 Implement `tweakScript` method: build chat history context, invoke Gemini with tools, validate script was modified, return result or error

## Task 5: Backend Application — Use Cases

- [ ] 5.1 Create `SendScriptTweakUseCase` at `apps/api/src/pipeline/application/use-cases/send-script-tweak.use-case.ts` — validate job exists, is in `script_review` stage, has a generated script; persist user message; fetch recent 10 messages; call `scriptTweaker.tweakScript`; persist assistant message; update job's `generatedScript` and `generatedScenes`; return `updatedScript` and `explanation`
- [ ] 5.2 Create `GetScriptTweakMessagesUseCase` at `apps/api/src/pipeline/application/use-cases/get-script-tweak-messages.use-case.ts` — validate job exists, fetch all `ScriptTweakMessage` records ordered by `createdAt` ascending, map to `TweakMessageDto[]`

## Task 6: Backend Presentation — Controller, Routes, Factory

- [ ] 6.1 Add `sendScriptTweak` and `getScriptTweakMessages` methods to `PipelineController` — validate input, delegate to use cases, handle errors (mirror `sendTweak` and `getTweakMessages`)
- [ ] 6.2 Update `PipelineController` constructor to accept `SendScriptTweakUseCase` and `GetScriptTweakMessagesUseCase` as dependencies
- [ ] 6.3 Add `POST /jobs/:id/script-tweak` and `GET /jobs/:id/script-tweak/messages` routes to `pipeline.routes.ts`
- [ ] 6.4 Update `createPipelineModule` in `pipeline.factory.ts` to instantiate `PrismaScriptTweakMessageRepository`, `AIScriptTweaker`, `SendScriptTweakUseCase`, `GetScriptTweakMessagesUseCase`, and wire them into the controller

## Task 7: Shared Types — Frontend DTOs

- [ ] 7.1 Add `SendScriptTweakParams` interface (`jobId`, `message`) and `SendScriptTweakResponse` interface (`status`, `updatedScript`, `explanation`) to `apps/web/src/features/pipeline/types/pipeline.types.ts`
- [ ] 7.2 Add `sendScriptTweak(params: SendScriptTweakParams): Promise<SendScriptTweakResponse>` and `getScriptTweakMessages(jobId: string): Promise<TweakMessageDto[]>` to the `PipelineRepository` interface at `apps/web/src/features/pipeline/interfaces/pipeline-repository.ts`
- [ ] 7.3 Implement `sendScriptTweak` and `getScriptTweakMessages` in `HttpPipelineRepository` at `apps/web/src/features/pipeline/repositories/http-pipeline.repository.ts`

## Task 8: Frontend Hook — useScriptTweakChat

- [ ] 8.1 Create `useScriptTweakChat` hook at `apps/web/src/features/pipeline/hooks/use-script-tweak-chat.ts` with options: `repository`, `jobId`, `onScriptUpdated` callback; returns: `messages`, `sendMessage`, `isLoading`, `isFetchingHistory`, `error`
- [ ] 8.2 Implement message history fetching on mount via `repository.getScriptTweakMessages(jobId)`
- [ ] 8.3 Implement `sendMessage`: optimistic user bubble → `repository.sendScriptTweak({ jobId, message })` → assistant bubble + `onScriptUpdated(response.updatedScript)` on success → error bubble on failure

## Task 9: Frontend Component — ScriptChatPanel

- [ ] 9.1 Create `ScriptChatPanel` component at `apps/web/src/features/pipeline/components/script-chat-panel.tsx` with props: `job`, `repository`, `onScriptUpdated`
- [ ] 9.2 Implement scrollable message list with user/assistant/error bubble styling (mirror `ChatPanel`)
- [ ] 9.3 Implement text input with send button, Enter key handling, loading indicator, and disabled state during requests
- [ ] 9.4 Use placeholder text "Describe a change to your script…"

## Task 10: Frontend Layout — ScriptReviewEditor Integration

- [ ] 10.1 Reorganize `ScriptReviewEditor` layout from 3-column (editor | narration | insights) to accommodate the `ScriptChatPanel` — left column for script editor, right column for chat panel, with narration and insights in a compact bar below the editor
- [ ] 10.2 Wire `ScriptChatPanel` into `ScriptReviewEditor` with `onScriptUpdated` callback that updates `editedScript` state, triggering re-render of editor content, scene blocks, and insights panel
- [ ] 10.3 Verify narration controls (voice selector, voice settings) and insights panel (word count, duration, tone, density) remain accessible and functional after layout changes

## Task 11: Property-Based Tests

- [ ] 11.1 Write PBT for Property 1 (edit_script correctness): for any script and unique substring, `applyEdit` produces correct replacement; for non-existent substring, returns error; for ambiguous substring, returns error
- [ ] 11.2 Write PBT for Property 3 (message ordering): for any set of ScriptTweakMessages with varying createdAt, repository returns them sorted ascending
- [ ] 11.3 Write PBT for Property 4 (context window limit): for any list of N messages, `findRecentByJobId(jobId, 10)` returns at most 10 messages, all from the most recent end

## Task 12: Unit Tests

- [ ] 12.1 Write unit tests for `SendScriptTweakUseCase`: job not found, wrong stage, no script, successful tweak, failed tweak, message persistence
- [ ] 12.2 Write unit tests for `GetScriptTweakMessagesUseCase`: job not found, returns messages for valid job
- [ ] 12.3 Write unit tests for `PipelineController.sendScriptTweak` and `getScriptTweakMessages` methods
