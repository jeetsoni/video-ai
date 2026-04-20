# Implementation Plan: SFX Audio Pipeline

## Overview

Add sound effects (SFX) audio layer to the video generation pipeline. Implementation follows the data flow: copy SFX files for browser preview → create the pure `generateSfxCode` function → integrate into `composeSceneComponents` → add SFX staging to the video renderer → update the direction generator prompt for utility SFX guidance.

## Tasks

- [x] 1. Copy SFX files to web public directory for browser preview
  - [x] 1.1 Create `apps/web/public/sfx/` directory and copy all 18 mp3 files from `packages/shared/src/sfx/assets/`
    - Copy all files listed in `ALL_SFX_FILENAMES`: 8 ambient, 6 transition, 4 utility
    - Preserve original filenames so `staticFile("sfx/<filename>")` resolves correctly
    - _Requirements: 2.1, 2.3, 2.4_

- [x] 2. Implement `generateSfxCode` pure function
  - [x] 2.1 Create `generateSfxCode` function in `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`
    - Signature: `function generateSfxCode(scenes: SceneDirection[], totalFrames: number, sfxMap: Record<string, SfxProfile>): string`
    - For each scene whose type exists in `sfxMap`: generate ambient `<Audio>` with `loop`, correct `from`/`durationInFrames`, and volume from the map
    - For each scene whose type exists in `sfxMap`: generate transition `<Audio>` with correct `from` and volume from the map
    - For each beat with non-empty `sfx` array: generate utility `<Audio>` at `frameRange[0]` with volume `0.25`, skipping filenames not in `ALL_SFX_FILENAMES`
    - Wrap all SFX Audio components in a single `<Sequence from={0} durationInFrames={totalFrames}>` wrapper
    - All `src` props use `staticFile("sfx/<filename>")`
    - Skip scenes whose type is not in `sfxMap` without error
    - Import `ALL_SFX_FILENAMES`, `SCENE_SFX_MAP`, and `SfxProfile` from `@video-ai/shared`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 7.3, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 10.4_

  - [ ]\* 2.2 Write property test: Ambient bed composition correctness
    - **Property 1: Ambient bed composition correctness**
    - Use fast-check to generate random scene plans with 1–8 scenes, random SceneTypes, random startFrame/durationFrames
    - Verify output contains `<Audio>` with correct filename, volume, `loop`, `from`, and `durationInFrames` for each scene with a valid type
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 2.4**

  - [ ]\* 2.3 Write property test: Transition sound composition correctness
    - **Property 2: Transition sound composition correctness**
    - Verify output contains `<Audio>` with correct transition filename, volume, `from` matching scene startFrame, no `loop` prop
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 2.4**

  - [ ]\* 2.4 Write property test: Utility sound composition correctness
    - **Property 3: Utility sound composition correctness**
    - Generate beats with random `sfx` arrays containing valid filenames
    - Verify output contains `<Audio>` at beat's `frameRange[0]` with volume `0.25`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 2.4**

  - [ ]\* 2.5 Write property test: Invalid utility filenames are skipped
    - **Property 4: Invalid utility filenames are skipped**
    - Generate beats with mix of valid and invalid filenames
    - Verify invalid filenames produce no `staticFile` reference, valid ones still included
    - **Validates: Requirements 5.5**

  - [ ]\* 2.6 Write property test: SFX code generation round-trip
    - **Property 5: SFX code generation round-trip**
    - Verify output of `generateSfxCode` is parseable as valid JSX using sucrase
    - **Validates: Requirements 8.1, 8.3**

  - [ ]\* 2.7 Write property test: SFX code generation idempotence
    - **Property 6: SFX code generation idempotence**
    - Call `generateSfxCode` twice with same input, assert string equality
    - **Validates: Requirements 8.2, 8.4**

  - [ ]\* 2.8 Write property test: Volume mixing caps
    - **Property 7: Volume mixing caps**
    - Verify all volume values in output respect caps: ambient ≤ 0.15, transition ≤ 0.40, utility ≤ 0.30
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ]\* 2.9 Write property test: Unknown scene type graceful skip
    - **Property 8: Unknown scene type graceful skip**
    - Generate scenes with types not in `SCENE_SFX_MAP`
    - Verify function produces valid output that omits SFX for unknown types without throwing
    - **Validates: Requirements 10.4**

- [x] 3. Integrate SFX into `composeSceneComponents`
  - [x] 3.1 Modify `composeSceneComponents` in `code-generation.worker.ts` to call `generateSfxCode`
    - Add `totalFrames` parameter (derive from scenes: last scene's `startFrame + durationFrames`)
    - Import `SCENE_SFX_MAP` from `@video-ai/shared`
    - Call `generateSfxCode(scenes, totalFrames, SCENE_SFX_MAP)` and insert the returned string as a sibling after scene `<Sequence>` elements inside the `<AbsoluteFill>`
    - Add a `{/* SFX Audio Layer */}` comment before the SFX block
    - _Requirements: 7.1, 7.3, 8.1_

  - [x] 3.2 Update the `CodeGenerationWorker.process()` call site to pass `totalFrames` to `composeSceneComponents`
    - Compute `totalFrames` from scene directions (last scene's startFrame + durationFrames)
    - Pass as additional argument to `composeSceneComponents`
    - _Requirements: 7.1_

  - [ ]\* 3.3 Write unit tests for `composeSceneComponents` SFX integration
    - Test that composed output includes the SFX code block
    - Test that voiceover Audio in `buildEntrySource` remains unchanged
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add SFX staging to `RemotionVideoRenderer`
  - [x] 5.1 Modify `RemotionVideoRenderer.render()` to stage SFX files before bundling
    - After creating `publicDir` and before writing the entry file, create `sfx/` subdirectory
    - Copy all files from `packages/shared/src/sfx/assets/` into `<tmpDir>/public/sfx/` using `ALL_SFX_FILENAMES`
    - Resolve source path relative to the shared package (use `path.resolve` from `__dirname` or a package-relative path)
    - Import `ALL_SFX_FILENAMES` from `@video-ai/shared`
    - _Requirements: 1.1, 1.2, 1.4, 2.4_

  - [x] 5.2 Implement graceful degradation for SFX staging failures
    - If a single file copy fails: log a warning with the filename, skip it, continue with remaining files
    - If sfx directory creation fails: log a warning, proceed with render (voiceover-only)
    - Never return `Result.fail()` for SFX-only issues
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]\* 5.3 Write unit tests for SFX staging logic
    - Test that all 18 files are copied to `public/sfx/`
    - Test graceful handling of a missing source file (warning logged, render continues)
    - Test that total staging failure still allows render to proceed
    - _Requirements: 1.1, 1.2, 1.3, 10.1, 10.2, 10.3_

- [x] 6. Update `AIDirectionGenerator` system prompt for utility SFX
  - [x] 6.1 Modify `buildDirectionSystemPrompt` in `ai-direction-generator.ts` to add utility SFX guidance
    - Replace the existing `sfx` field description in the beat JSON schema section
    - Add a new `### sfx field (utility sounds only)` section listing the 4 utility filenames: `text-pop.mp3`, `slide-in.mp3`, `success-ding.mp3`, `scene-fade.mp3`
    - Include placement rules: 1–3 per scene, only on beats with distinct visual events, NOT on every beat
    - Explicitly state NOT to use ambient or transition filenames (those are handled automatically by `SCENE_SFX_MAP`)
    - Update the beat JSON schema example to show `"sfx": ["text-pop.mp3"]` format (array of filenames only, no timestamps or volume)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]\* 6.2 Write unit tests for direction generator prompt updates
    - Test that the system prompt includes all 4 utility SFX filenames
    - Test that the prompt excludes ambient/transition filenames from beat sfx guidance
    - _Requirements: 6.4, 6.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses TypeScript throughout — all implementation uses TypeScript
- Property tests use `fast-check` (standard in the Jest ecosystem)
- `generateSfxCode` is a pure function co-located with `composeSceneComponents` in `code-generation.worker.ts`
- SFX staging failures are warnings, never errors — voiceover and visuals always take priority
- The `sfx` field already exists in `SceneBeat` type — no type changes needed
