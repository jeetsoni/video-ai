# How Kiro Was Used to Build KalpanaAI

## Overview

KalpanaAI is an AI-powered video editing platform built entirely with Kiro as the primary development environment. This document details how Kiro's features shaped the development workflow and accelerated delivery.

## Spec-Driven Development

Kiro's spec-driven development was the backbone of this project. I created **21 specs** covering features and bugfixes, each following the structured workflow of Requirements → Design → Tasks.

### Feature Specs

| Spec                                          | Description                                                    |
| --------------------------------------------- | -------------------------------------------------------------- |
| `faceless-video-generation`                   | Core pipeline for generating faceless videos from text prompts |
| `streaming-script-generation`                 | Real-time streaming of AI-generated scripts to the UI          |
| `script-chat`                                 | Conversational interface for refining video scripts            |
| `client-side-remotion-preview`                | Browser-based video preview using Remotion                     |
| `video-preview-page`                          | Dedicated page for previewing generated videos                 |
| `video-preview-redesign`                      | UI overhaul of the video preview experience                    |
| `pixel-perfect-layout-system`                 | Precise layout engine for video composition                    |
| `virtual-camera-system`                       | Camera movement and zoom effects for scenes                    |
| `pipeline-progress-sse`                       | Server-Sent Events for real-time pipeline progress             |
| `smart-download`                              | Intelligent video download with format options                 |
| `sfx-audio-pipeline`                          | Sound effects and audio processing pipeline                    |
| `voice-selector-preview`                      | Voice selection with audio preview                             |
| `voice-settings-controls`                     | Fine-grained voice parameter controls                          |
| `voice-settings-preview`                      | Live preview of voice setting changes                          |
| `merge-scene-planning-into-script-generation` | Unified scene planning and script generation                   |
| `streaming-code-preview`                      | Progressive streaming of AI-generated Remotion code            |
| `preview-chat-tweaks`                         | Natural language chat to tweak animations in preview           |
| `comprehensive-test-coverage`                 | Property-based and unit test suite across the pipeline         |

### Bugfix Specs

| Spec                           | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `regenerate-from-done-fix`     | Fixed regeneration from completed state            |
| `sse-reconnect-scene-progress` | Fixed SSE reconnection for scene progress tracking |
| `voiceover-playback-fix`       | Fixed voiceover audio playback issues              |

### How Spec-Driven Development Helped

The spec workflow fundamentally changed how I approached this project. Instead of jumping into code, every feature started with a requirements document that forced me to think through edge cases and acceptance criteria upfront.

The `faceless-video-generation` spec was the most impactful — it has 12 requirements with detailed acceptance criteria covering everything from topic validation (3–500 characters) to retry strategies per pipeline stage. During the design phase, I mapped out the full pipeline state machine (script_generation → script_review → tts_generation → transcription → timestamp_mapping → direction_generation → code_generation → preview → rendering → done) and realized I needed 7 dedicated BullMQ workers with a Redis Pub/Sub layer for real-time streaming. That architectural decision came from the spec, not from trial and error in code.

The design document also defined 12 correctness properties — formal statements like "for any valid scene plan, scenes SHALL be sorted by startTime with no gaps and no overlaps." These properties directly became property-based tests using `fast-check`, giving me confidence that the pipeline logic was correct across random inputs, not just hand-picked examples.

For the `streaming-script-generation` spec, writing requirements first revealed that I needed a `Stream_Event_Buffer` (Redis list) so clients that reconnect mid-generation can catch up on missed events. Without the spec phase, I would have built a naive SSE stream and discovered the reconnection problem only after deployment.

The `sfx-audio-pipeline` spec forced me to design the SFX staging system before coding — I needed to copy 18 audio assets from the shared package into Remotion's temporary `public/` directory at render time, while also serving them from Next.js `public/` for browser preview. The spec made this dual-path requirement explicit before I wrote a single line.

The `streaming-code-preview` spec was another case where upfront design paid off. The requirements revealed I needed a `Sequence_Block_Parser` to detect complete `<Sequence>` scene blocks by tracking JSX bracket depth, a `Partial_Code_Assembler` to prepend preamble code and append closing tags, and graceful fallback to full-code rendering if partial evaluation fails. Without the spec, I would have tried to stream raw tokens and hit evaluation failures immediately.

Bugfix specs like `sse-reconnect-scene-progress` and `regenerate-from-done-fix` were equally valuable — they required me to write acceptance criteria for the broken behavior first, which made the fix targeted and verifiable rather than a guessing game.

## Agent Hooks

I configured three agent hooks to automate quality checks throughout development:

### 1. Lint on Save (`lint-on-save`)

- **Trigger**: Any `.ts` or `.tsx` file is saved
- **Action**: Runs `npx turbo lint` automatically
- **Impact**: Caught formatting and import issues immediately, preventing them from accumulating

### 2. Test After Task Completion (`test-after-task`)

- **Trigger**: After any spec task is marked complete
- **Action**: Runs `npx turbo test` automatically
- **Impact**: Ensured each implementation step passed tests before moving to the next task

### 3. Review Write Operations (`review-write-ops`)

- **Trigger**: Before any file write operation
- **Action**: Reminds the agent to verify Clean Architecture boundaries, kebab-case naming, and Result pattern usage
- **Impact**: Maintained architectural consistency across the codebase without manual code review

### How Hooks Improved Development

The `review-write-ops` hook (preToolUse on write) was the most impactful of the three. Every time Kiro was about to write a file, it first verified four things: kebab-case file naming, Clean Architecture layer boundaries (dependencies point inward only), `Result.ok()`/`Result.fail()` instead of throwing, and no "WHAT" comments. This caught real issues — for example, when generating the `ElevenLabsTTSService`, the hook ensured it lived in `infrastructure/services/` (not `application/`) and that it returned `Result.fail(PipelineError.ttsGenerationFailed(...))` instead of throwing an exception. Without this hook, the generated code would have mixed error handling patterns across the codebase.

The `test-after-task` hook (postTaskExecution) created a tight feedback loop. After completing each spec task — like implementing the `CreatePipelineJobUseCase` or the `ScriptGenerationWorker` — the full test suite ran automatically via `npx turbo test`. This caught regressions immediately. When I added the voice settings feature, the hook caught that a new Zod schema field (`voiceSettings`) broke existing pipeline creation tests before I moved on to the next task.

The `lint-on-save` hook (fileEdited on `*.ts`/`*.tsx`) was the simplest but prevented lint debt from accumulating. Every saved file triggered `npx turbo lint`, so import ordering issues and unused variables were caught in real time rather than piling up for a cleanup session later.

## Steering Docs

I used a workspace-level steering file (`project-conventions.md`) that provided Kiro with:

- **Architecture rules**: Clean Architecture layer boundaries, dependency direction
- **File naming conventions**: kebab-case for all files
- **Code style**: No "WHAT" comments, self-documenting code
- **Foundational types**: Result pattern, UseCase interface, Controller interface
- **Infrastructure details**: Docker Compose services, environment variables

### How Steering Improved Responses

The steering doc was critical for maintaining consistency across 15+ use cases, 7 workers, and dozens of infrastructure services. It told Kiro exactly where things go: use cases in `application/use-cases/`, repository interfaces in `domain/interfaces/repositories/`, implementations in `infrastructure/repositories/`, and factories (composition root) in `presentation/factories/` — NOT in application.

The biggest win was the Result pattern enforcement. The steering doc explicitly listed `src/shared/domain/result.ts` as a foundational type and stated "Use `Result.ok()` / `Result.fail()` instead of throwing errors." Every generated use case — from `CreatePipelineJobUseCase` to `SendScriptTweakUseCase` — correctly used this pattern. The `approve-script.use-case.ts`, for example, returns `Result.fail(new ValidationError(...))` for invalid job states instead of throwing, which made error handling predictable across the entire pipeline.

The kebab-case naming convention prevented inconsistency across the monorepo. With files like `elevenlabs-tts-service.ts`, `pipeline-job.mapper.ts`, `voice-settings-controls.tsx`, and `use-pipeline-progress.ts`, the naming is uniform. The steering doc also specified suffixes: `.use-case.ts`, `.factory.ts`, `.schema.ts`, `.types.ts` — so every file's purpose is clear from its name.

The "no WHAT comments" rule kept the codebase clean. Instead of `// Create a new pipeline job`, the code uses self-documenting names like `CreatePipelineJobUseCase` with a clear `execute()` method. Comments only appear for non-obvious business logic.

## Vibe Coding

Vibe coding with Kiro was how I iterated on the UI-heavy features where specs would have been overkill for rapid exploration. The landing page `DraftHero` component — a full-screen hero with topic input, format selector, theme grid, voice picker with settings sliders, and a "Create" button — was built through conversational iteration. I described the layout I wanted, Kiro generated the initial component with Tailwind CSS 4 and shadcn/ui, and I refined it through back-and-forth ("make the theme cards show the actual color palette", "add the voice settings sliders below the voice selector", "make the format badges more compact").

The `showcase-wall` and `showcase-carousel` components on the landing page — an auto-scrolling carousel of completed videos — were also vibe-coded. I described the concept and Kiro generated the infinite scroll animation, thumbnail rendering, and responsive layout in one pass.

For the `video-preview-page`, the most complex frontend component at ~750 lines, I used a mix of spec-driven development for the core logic (chat panel, code evaluation, Remotion player integration) and vibe coding for the layout and polish (two-column responsive layout, scene timeline scrubber, metadata display, download button placement).

The `features-grid` component on the landing page — showcasing KalpanaAI's capabilities with icons and descriptions — was entirely vibe-coded in a single conversation turn. Same with the `project-card` components for the projects listing page.

## ElevenLabs Integration

KalpanaAI integrates ElevenLabs deeply across three areas using the `@elevenlabs/elevenlabs-js` SDK:

**Text-to-Speech with Word-Level Timestamps**: The core pipeline uses `client.textToSpeech.convertWithTimestamps()` to generate voiceover audio AND get character-level alignment data in a single API call. The `ElevenLabsTTSService` converts the character-level alignment into word-level `WordTimestamp[]` objects by accumulating characters between whitespace boundaries. These timestamps drive the entire animation system — every visual beat, text animation, and scene transition is synchronized to the exact moment each word is spoken. I use the `eleven_v3` model for production TTS.

**Voice Preview with Settings Controls**: Users can audition voices before committing to a full pipeline job. The `generatePreview()` method uses `client.textToSpeech.convert()` with the faster `eleven_flash_v2_5` model to generate a quick audio sample with the user's current slider values. The frontend `use-voice-settings-preview` hook manages the preview lifecycle with a cooldown period to prevent API abuse.

**Voice Listing and Featured Voices**: The `ElevenLabsVoiceService` calls `client.voices.getAll()` to fetch available voices, maps them through `mapSdkVoiceToEntry()`, and sorts featured voices first. I curated 5 featured voices (Will, Sarah, Natasha, Josh, Adam) spanning different styles — from relaxed optimist to valley girl to documentary narrator. If the API call fails, the service gracefully falls back to the hardcoded featured voice list.

**Four Voice Settings**: Users control `speed` (0.7–1.2), `stability` (0–1), `similarityBoost` (0–1), and `style` (0–1) through slider controls. These are passed directly to the ElevenLabs API's `voiceSettings` parameter on both the TTS and preview endpoints. The `VoiceSettingsControls` component renders four sliders with the ranges defined in `VOICE_SETTINGS_RANGES` from the shared package.

**Sound Effects Pipeline**: Beyond voice, I built a full SFX system with 18 audio assets (ambient beds per scene type, transition whooshes, utility sounds like text-pop and success-ding). The `SCENE_SFX_MAP` deterministically maps each scene type (Hook, Bridge, Architecture, etc.) to its ambient and transition sounds, while the AI direction generator assigns utility SFX to individual beats.

## MCP Usage

I did not use additional MCP servers beyond Kiro's built-in capabilities for this project. The ElevenLabs integration was built directly using the `@elevenlabs/elevenlabs-js` SDK, with the API documentation as reference. Kiro's native code generation and file management capabilities were sufficient for the development workflow.

## Kiro Powers

I used the **ElevenLabs Kiro Power** during development, which gave Kiro working knowledge of all ElevenLabs APIs. This was particularly helpful when building the TTS integration — the power provided accurate guidance on using `convertWithTimestamps` for word-level alignment (vs. the simpler `convert` for preview), the correct `voiceSettings` parameter structure, and the `eleven_v3` vs `eleven_flash_v2_5` model selection. It saved me from reading through the full API docs and helped me discover the character-level alignment response format that I then converted into word-level timestamps for animation synchronization.
