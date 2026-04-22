# Implementation Plan: Streaming Code Preview

## Overview

Add progressive/streaming code preview to the video generation pipeline. The backend streams AI-generated Remotion component code tokens via SSE, and the frontend accumulates tokens, detects complete `<Sequence>` blocks, evaluates partial code, and renders completed scenes immediately in the Remotion Player with placeholders for pending scenes. Implementation follows the existing streaming script generation patterns (SSE + Redis Pub/Sub + event buffer).

## Tasks

- [x] 1. Extract shared code generation prompts
  - [x] 1.1 Create `code-generation-prompts.ts` shared module
    - Create `apps/api/src/pipeline/infrastructure/services/code-generation-prompts.ts`
    - Extract `buildCodeSystemPrompt()`, `buildCodePrompt()`, `hasMainComponent()`, `cleanCodeOutput()`, and `buildSlotPixelTable()` from `ai-code-generator.ts` into this new module
    - Export all functions
    - _Requirements: 1.6_

  - [x] 1.2 Refactor `AICodeGenerator` to use shared prompts
    - Update `ai-code-generator.ts` to import `buildCodeSystemPrompt`, `buildCodePrompt`, `hasMainComponent`, `cleanCodeOutput` from `code-generation-prompts.ts`
    - Remove the local function definitions
    - Verify existing behavior is unchanged
    - _Requirements: 8.3_

  - [ ]* 1.3 Write unit tests for extracted prompt functions
    - Test `buildCodeSystemPrompt()` produces expected system prompt with theme and layout profile
    - Test `buildCodePrompt()` includes the scene plan JSON
    - Test `hasMainComponent()` detects `function Main(` pattern
    - Test `cleanCodeOutput()` strips markdown fences
    - _Requirements: 1.6, 8.3_

- [x] 2. Implement `StreamingCodeGenerator` interface and `AIStreamingCodeGenerator`
  - [x] 2.1 Create `StreamingCodeGenerator` interface
    - Create `apps/api/src/pipeline/application/interfaces/streaming-code-generator.ts`
    - Define `generateStream()` method with `onChunk`, `onDone`, `onError` callbacks and `signal` for abort
    - _Requirements: 1.1, 1.5_

  - [x] 2.2 Implement `AIStreamingCodeGenerator`
    - Create `apps/api/src/pipeline/infrastructure/services/ai-streaming-code-generator.ts`
    - Use `streamText()` from `ai` SDK with `createGoogleGenerativeAI` (same provider/model as `AICodeGenerator`)
    - Import shared prompt functions from `code-generation-prompts.ts`
    - Iterate `textStream`, calling `onChunk(delta)` for each text delta
    - On completion, validate full text with `hasMainComponent()`, clean with `cleanCodeOutput()`
    - Retry up to `maxRetries` on missing Main function, streaming each attempt
    - Respect `signal` (AbortSignal) to abort streaming on client disconnect
    - Call `onDone(fullCode)` on success, `onError(pipelineError)` on failure
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 2.3 Write unit tests for `AIStreamingCodeGenerator`
    - Mock `streamText()`, verify `onChunk` called for each delta
    - Verify `onDone` called with full cleaned code
    - Test retry logic when `hasMainComponent()` returns false
    - Test abort via AbortSignal
    - _Requirements: 1.1, 1.5, 1.7, 1.8_

- [x] 3. Define SSE event schema in shared package
  - [x] 3.1 Create `code-stream-event.schema.ts`
    - Create `packages/shared/src/schemas/code-stream-event.schema.ts`
    - Define `codeStreamEventSchema` as a Zod discriminated union with `chunk`, `done`, and `error` event types (each with `seq` number)
    - Export `CodeStreamEvent` type
    - _Requirements: 7.6_

  - [x] 3.2 Export schema from shared package barrel
    - Add export to `packages/shared/src/index.ts` (or appropriate barrel file)
    - _Requirements: 7.6_

- [x] 4. Implement `CodeStreamController` and SSE endpoint
  - [x] 4.1 Create `CodeStreamController`
    - Create `apps/api/src/pipeline/presentation/controllers/code-stream.controller.ts`
    - Follow the same pattern as existing `StreamController`
    - Validate job ID (UUID format), check job exists and is in `code_generation` stage
    - Return 404 if not found, 400 if wrong stage
    - Set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
    - Subscribe to Redis Pub/Sub channel `stream:code:{jobId}`
    - Replay buffered events from `stream:buffer:code:{jobId}`
    - Send heartbeat every 15s, clean up on client disconnect
    - If job is past `code_generation`, replay `done` event from buffer or synthesize from stored `generatedCode`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.2 Register code-stream route in `pipeline.routes.ts`
    - Add `GET /jobs/:id/code-stream` route pointing to `codeStreamController.streamCodeGeneration()`
    - Wire `CodeStreamController` in the route factory/composition root
    - _Requirements: 7.1_

  - [ ]* 4.3 Write unit tests for `CodeStreamController`
    - Mock Redis buffer/subscriber, test SSE header setup
    - Test event replay from buffer
    - Test 404 for missing job, 400 for wrong stage
    - Test heartbeat and cleanup on disconnect
    - Test late connection (job past `code_generation`) replays done event
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 5. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update `CodeGenerationWorker` with streaming path
  - [x] 6.1 Add streaming support to `CodeGenerationWorker`
    - Accept optional `StreamingCodeGenerator` dependency in constructor
    - When streaming generator is available, call `generateStream()` instead of `generateCode()`
    - In `onChunk` callback: publish chunk events to Redis channel `stream:code:{jobId}` and append to buffer `stream:buffer:code:{jobId}`
    - In `onDone` callback: publish done event, then proceed with layout validation and stage transition as before
    - If streaming fails, fall back to existing `generateCode()` batch path
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3_

  - [ ]* 6.2 Write unit tests for worker streaming path
    - Mock streaming generator, verify Redis publish calls for chunk and done events
    - Verify fallback to batch `generateCode()` on streaming failure
    - Verify layout validation still runs after streaming completes
    - _Requirements: 1.1, 8.2, 8.3_

- [x] 7. Implement `SequenceBlockParser` frontend utility
  - [x] 7.1 Create `sequence-block-parser.ts`
    - Create `apps/web/src/features/pipeline/utils/sequence-block-parser.ts`
    - Implement `parseSequenceBlocks(code: string): SequenceParseResult`
    - Track JSX depth: increment on `<Sequence` (not self-closing), decrement on `</Sequence>`
    - Track nested JSX tags within each `<Sequence>` block for balance
    - Handle self-closing tags (`<Component />`) without affecting depth
    - Handle JSX expressions (`{...}`) containing `<` and `>` by tracking curly brace depth
    - Return `{ completeCount, lastCompleteEndIndex }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 7.2 Write property test: Sequence block parser correctly counts complete balanced blocks (Property 2)
    - **Property 2: Sequence block parser correctly counts complete balanced blocks**
    - Generate random JSX-like strings with a known number of complete `<Sequence>...</Sequence>` blocks (with random nested JSX inside) and optionally an incomplete trailing block
    - Verify `completeCount` matches the known count
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 7.3 Write property test: Sequence block parser end index points to last complete block boundary (Property 3)
    - **Property 3: Sequence block parser end index points to last complete block boundary**
    - Generate strings with N complete `<Sequence>` blocks, verify `lastCompleteEndIndex` equals position after last `</Sequence>` closing `>`
    - Generate strings with zero complete blocks and verify `null`
    - **Validates: Requirements 3.4, 3.5**

  - [ ]* 7.4 Write unit tests for `SequenceBlockParser` edge cases
    - Test empty string, no Sequence tags, self-closing tags, nested components
    - Test unbalanced tags, JSX expressions with `<`/`>` operators
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. Implement `PartialCodeAssembler` frontend utility
  - [x] 8.1 Create `partial-code-assembler.ts`
    - Create `apps/web/src/features/pipeline/utils/partial-code-assembler.ts`
    - Implement `assemblePartialCode(accumulatedCode: string, lastCompleteEndIndex: number): string | null`
    - Find `function Main(` declaration, extract preamble through opening `<AbsoluteFill...>` tag
    - Take code from after `<AbsoluteFill...>` through `lastCompleteEndIndex`
    - Append closing tags: `\n</AbsoluteFill>\n)\n}\n`
    - Return `null` if preamble pattern not found yet
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 8.2 Write property test: Partial code assembly round-trip produces evaluable component (Property 4)
    - **Property 4: Partial code assembly round-trip produces evaluable component**
    - Generate valid Remotion component code templates with varying numbers of `<Sequence>` blocks (1-10), varying preamble content
    - Run `assemblePartialCode()` then `evaluateComponentCode()`
    - Verify a non-null component is returned
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1**

  - [ ]* 8.3 Write unit tests for `PartialCodeAssembler` edge cases
    - Test code without Main function (returns null)
    - Test code with Main but no complete Sequences (returns null)
    - Test code with preamble containing helper functions and constants
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 9. Checkpoint — Ensure all parser and assembler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement `useStreamingCode` hook
  - [x] 10.1 Create `use-streaming-code.ts` hook
    - Create `apps/web/src/features/pipeline/hooks/use-streaming-code.ts`
    - Open SSE connection to `/api/pipeline/jobs/:id/code-stream` using existing `SSEClient`
    - Parse events with `codeStreamEventSchema` from `@video-ai/shared`
    - On `chunk`: append text to accumulated code, run `parseSequenceBlocks()`
    - When `completeCount` increases: run `assemblePartialCode()` then `evaluateComponentCode()`
    - On `done`: evaluate full final code via `evaluateComponentCode()`
    - On `error` or connection failure: set status to `error`
    - Close SSE connection on unmount
    - Expose `{ component, completedSceneCount, status, error, finalCode }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.5, 6.1, 6.2, 6.3, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 10.2 Write property test: Token accumulation is concatenation (Property 1)
    - **Property 1: Token accumulation is concatenation**
    - Generate random arrays of string deltas (varying lengths, empty strings, unicode, special characters)
    - Accumulate sequentially, verify result equals concatenation
    - **Validates: Requirements 2.2**

  - [ ]* 10.3 Write unit tests for `useStreamingCode` hook
    - Mock SSEClient, test status transitions (connecting → streaming → complete)
    - Test error handling and cleanup on unmount
    - Test partial evaluation triggers only when `completeCount` changes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 9.2, 9.3, 9.4_

- [x] 11. Implement `ScenePlaceholder` component
  - [x] 11.1 Create `scene-placeholder.tsx`
    - Create `apps/web/src/features/pipeline/components/scene-placeholder.tsx`
    - Render within a `<Sequence>` at the correct frame range for the pending scene
    - Show a pulsing shimmer loading animation with the scene number
    - Use design system colors for visual consistency
    - _Requirements: 5.3, 5.4_

  - [ ]* 11.2 Write unit tests for `ScenePlaceholder`
    - Verify renders with correct scene number and loading animation
    - _Requirements: 5.3, 5.4_

- [x] 12. Implement `StreamingPreviewPlayer` component
  - [x] 12.1 Create `streaming-preview-player.tsx`
    - Create `apps/web/src/features/pipeline/components/streaming-preview-player.tsx`
    - Wrap the existing `RemotionPreviewPlayer` pattern using `@remotion/player`
    - When `component` is non-null: render partial component for completed scenes + `ScenePlaceholder` for remaining scenes
    - Use `<Sequence>` tags with correct `from` and `durationInFrames` for each placeholder, sourced from ScenePlan
    - When `component` is null: render all placeholders
    - No audio during streaming (added only when full component is ready)
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [ ]* 12.2 Write property test: Placeholder frame ranges match ScenePlan scene timing (Property 5)
    - **Property 5: Placeholder frame ranges match ScenePlan scene timing**
    - Generate random ScenePlans with 2-10 scenes, each with random `startFrame` and `durationFrames`
    - For each K from 0 to N-1, verify N-K placeholders with correct frame ranges
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 12.3 Write unit tests for `StreamingPreviewPlayer`
    - Verify renders partial component + correct number of placeholders
    - Verify all placeholders when component is null
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 13. Update `VideoPreviewPage` for streaming integration
  - [x] 13.1 Integrate streaming code preview into `VideoPreviewPage`
    - Detect when job is in `code_generation` stage and activate `useStreamingCode` hook
    - Render `StreamingPreviewPlayer` during streaming, showing completed scenes + placeholders
    - When streaming completes (`status === "complete"`), transition to existing `RemotionPreviewPlayer` with full component and audio
    - If SSE connection fails, fall back to existing `usePreviewData` flow
    - Display streaming progress indicator: "Generating code... X of Y scenes complete"
    - _Requirements: 5.2, 5.5, 5.6, 6.1, 6.3, 6.4, 8.2, 9.5_

  - [ ]* 13.2 Write unit tests for `VideoPreviewPage` streaming integration
    - Verify streaming mode activates during `code_generation` stage
    - Verify transition to full preview on completion
    - Verify fallback on SSE failure
    - _Requirements: 5.6, 6.3, 6.4, 8.2, 9.5_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `AICodeGenerator` and `CodeGenerator` interface remain unchanged (Requirement 8.3)
- SSE patterns follow the existing `StreamController` / `use-streaming-script.ts` conventions
