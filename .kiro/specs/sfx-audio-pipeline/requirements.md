# Requirements Document

## Introduction

Add sound effects (SFX) to the video generation pipeline so that rendered videos and browser previews include ambient beds, transition sounds, and utility sounds alongside the voiceover audio. The system uses the existing SFX library (`packages/shared/src/sfx/`) which maps each scene type to an `SfxProfile` containing ambient and transition filenames with volume levels. SFX audio files are committed to the Next.js `public/` directory for browser preview and copied into the Remotion temporary `public/` directory at render time. SFX are composed as `<Audio>` components with precise timing, looping, and volume control within the generated Remotion code.

Ambient beds and transition sounds are deterministically mapped by scene type via `SCENE_SFX_MAP`. Utility sounds (text-pop, slide-in, success-ding, scene-fade) on specific beats are decided by the LLM direction generator during the direction generation stage and stored in the `SceneBeat.sfx` field.

## Glossary

- **SFX_Pipeline**: The subsystem responsible for resolving, staging, and composing sound effect audio into the Remotion render
- **SFX_Library**: The `sfx-library.ts` module in `@video-ai/shared` that exports `SCENE_SFX_MAP`, `SFX_AMBIENT_ASSETS`, `SFX_TRANSITION_ASSETS`, `SFX_UTILITY_ASSETS`, and `ALL_SFX_FILENAMES`
- **SfxProfile**: A configuration object mapping a scene type to its ambient filename, transition filename, ambient volume, and transition volume
- **SCENE_SFX_MAP**: A record mapping each `SceneType` to its `SfxProfile`
- **Ambient_Bed**: A 10-second loopable background audio track that plays continuously for the duration of a scene at low volume
- **Transition_Sound**: A 1–2 second audio hit played at the start frame of a scene to mark the transition
- **Utility_Sound**: A short (0.5–2 second) audio effect (text-pop, slide-in, success-ding, scene-fade) triggered at specific beat boundaries within a scene
- **Scene_Beat**: A `SceneBeat` object within a `SceneDirection` that may contain an `sfx` array of utility sound filenames to trigger
- **Remotion_Entry**: The generated TypeScript entry file that Remotion bundles and renders, containing all `<Audio>` components
- **SFX_Staging**: The process of copying all SFX audio files from the shared package into the Remotion temporary `public/` directory before bundling
- **Video_Renderer**: The `RemotionVideoRenderer` infrastructure service that bundles and renders the final video
- **Code_Composer**: The `composeSceneComponents` function that assembles individual scene codes into the final `Main` component
- **Direction_Generator**: The LLM-based service that produces `SceneDirection` objects including beat-level utility SFX assignments
- **Browser_Preview**: The `@remotion/player`-based preview in the Next.js web app that evaluates generated code via `new Function()` and plays it in the browser
- **Web_Public_Directory**: The `apps/web/public/` directory from which `staticFile()` resolves files in the browser preview context

## Requirements

### Requirement 1: SFX File Staging for Server-Side Render

**User Story:** As a video rendering pipeline, I want all SFX audio files to be available in the Remotion public directory at render time, so that `staticFile()` references resolve correctly during bundling.

#### Acceptance Criteria

1. WHEN the Video_Renderer begins a render, THE SFX_Pipeline SHALL copy all SFX audio files from the shared package assets directory into the Remotion temporary `public/` directory
2. THE SFX_Pipeline SHALL copy all files listed in `ALL_SFX_FILENAMES` (all 18 ambient, transition, and utility sound files) regardless of which files are referenced by the current scene plan
3. IF an SFX audio file listed in `ALL_SFX_FILENAMES` does not exist in the shared package assets directory, THEN THE SFX_Pipeline SHALL return a `Result.fail()` with a descriptive error identifying the missing file
4. THE SFX_Pipeline SHALL preserve the original filenames when copying to the public directory so that `staticFile("whoosh-forward.mp3")` resolves correctly

### Requirement 2: SFX Files in Web Public Directory for Browser Preview

**User Story:** As a user previewing a video in the browser, I want SFX audio to play in the Remotion Player preview, so that I can hear the full audio experience before rendering.

#### Acceptance Criteria

1. THE Web_Public_Directory SHALL contain all SFX audio files listed in `ALL_SFX_FILENAMES` committed under a `sfx/` subdirectory (i.e., `apps/web/public/sfx/`)
2. THE Browser_Preview SHALL resolve SFX audio via `staticFile("sfx/<filename>")` so that the Remotion Player can play them during preview
3. WHEN new SFX files are added to the SFX_Library, THE developer SHALL add the corresponding audio files to `apps/web/public/sfx/` as part of the same change
4. THE Code_Composer SHALL use a path prefix that works in both contexts: `staticFile("sfx/<filename>")` for browser preview and `staticFile("sfx/<filename>")` for server-side render (the SFX_Staging step SHALL copy files into a `sfx/` subdirectory within the Remotion temporary `public/` directory)

### Requirement 3: Ambient Bed Audio Composition

**User Story:** As a viewer, I want each scene to have a subtle background ambient sound that matches the scene mood, so that the video feels more immersive and polished.

#### Acceptance Criteria

1. FOR EACH scene in the scene plan, THE Code_Composer SHALL generate an `<Audio>` component that plays the ambient bed file specified by `SCENE_SFX_MAP[sceneType].ambience`
2. THE ambient `<Audio>` component SHALL be wrapped in a `<Sequence>` with `from` set to the scene's `startFrame` and `durationInFrames` set to the scene's `durationFrames`
3. THE ambient `<Audio>` component SHALL set its `volume` prop to the value from `SCENE_SFX_MAP[sceneType].ambienceVolume`
4. THE ambient `<Audio>` component SHALL set `loop={true}` so the 10-second ambient file repeats for the full scene duration
5. THE ambient `<Audio>` component SHALL reference the file using `staticFile("sfx/<filename>")` where filename matches the staged file

### Requirement 4: Transition Sound Composition

**User Story:** As a viewer, I want to hear a brief transition sound at the start of each scene, so that scene changes feel intentional and dynamic.

#### Acceptance Criteria

1. FOR EACH scene in the scene plan, THE Code_Composer SHALL generate an `<Audio>` component that plays the transition sound file specified by `SCENE_SFX_MAP[sceneType].transition`
2. THE transition `<Audio>` component SHALL be wrapped in a `<Sequence>` with `from` set to the scene's `startFrame`
3. THE transition `<Audio>` component SHALL set its `volume` prop to the value from `SCENE_SFX_MAP[sceneType].transitionVolume`
4. THE transition `<Audio>` component SHALL NOT set `loop` (single playback for the duration of the sound file)
5. THE first scene in the scene plan SHALL include its transition sound (the opening whoosh)

### Requirement 5: Utility Sound Composition

**User Story:** As a viewer, I want to hear short accent sounds (pops, slides, dings) at key visual moments within a scene, so that animations feel synchronized with audio cues.

#### Acceptance Criteria

1. WHEN a Scene_Beat contains a non-empty `sfx` array, THE Code_Composer SHALL generate an `<Audio>` component for each filename in the array
2. THE utility `<Audio>` component SHALL be wrapped in a `<Sequence>` with `from` set to the beat's `frameRange[0]` value
3. THE utility `<Audio>` component SHALL set its `volume` prop to `0.25`
4. THE utility `<Audio>` component SHALL reference the file using `staticFile("sfx/<filename>")` where filename is the value from the beat's `sfx` array
5. IF a beat's `sfx` array contains a filename that is not in `ALL_SFX_FILENAMES`, THEN THE Code_Composer SHALL skip that entry and continue without error

### Requirement 6: Direction Generator Utility SFX Assignment

**User Story:** As a content creator, I want the AI direction generator to intelligently place utility sounds at key visual moments, so that the SFX enhance the storytelling without manual placement.

#### Acceptance Criteria

1. WHEN the Direction_Generator produces a `SceneDirection`, THE Direction_Generator SHALL populate the `sfx` array on individual `SceneBeat` objects with utility sound filenames from `SFX_UTILITY_ASSETS`
2. THE Direction_Generator SHALL select utility sounds that match the beat's visual action (text-pop for text appearances, slide-in for element entries, success-ding for positive reveals, scene-fade for endings)
3. THE Direction_Generator SHALL NOT place utility sounds on every beat — only on beats where a distinct visual event benefits from audio reinforcement
4. THE Direction_Generator SHALL only use filenames that exist in `ALL_SFX_FILENAMES` when populating beat `sfx` arrays
5. THE Direction_Generator SHALL NOT assign ambient or transition sounds via beat `sfx` arrays (those are handled deterministically by `SCENE_SFX_MAP`)

### Requirement 7: SFX Audio Layer Isolation

**User Story:** As a developer, I want SFX audio to be composed as a separate layer from the voiceover, so that the two audio sources do not interfere and can be independently controlled.

#### Acceptance Criteria

1. THE Remotion_Entry SHALL render all SFX `<Audio>` components as siblings to the voiceover `<Audio>` component, not nested within scene visual components
2. THE SFX audio layer SHALL NOT modify the existing voiceover `<Audio>` component or its volume
3. THE Remotion_Entry SHALL group all SFX `<Audio>` components within a single `<Sequence from={0} durationInFrames={totalFrames}>` wrapper for organizational clarity

### Requirement 8: SFX Composition Code Generation

**User Story:** As a developer, I want the SFX audio layer code to be generated deterministically from the scene plan, so that the output is predictable and testable.

#### Acceptance Criteria

1. THE Code_Composer SHALL generate SFX audio code as a string that can be inserted into the Remotion_Entry source
2. THE generated SFX code SHALL be a pure function of the `ScenePlan` and `SCENE_SFX_MAP` — no randomness or external state
3. FOR ALL valid ScenePlan inputs, generating the SFX code then parsing it as valid JSX SHALL succeed (round-trip property)
4. THE generated SFX code SHALL produce identical output when called twice with the same ScenePlan input (idempotence)

### Requirement 9: Volume Mixing Constraints

**User Story:** As a viewer, I want the SFX to enhance the video without overpowering the voiceover narration, so that spoken content remains clearly audible.

#### Acceptance Criteria

1. THE ambient bed volume for any scene SHALL NOT exceed `0.15`
2. THE transition sound volume for any scene SHALL NOT exceed `0.40`
3. THE utility sound volume SHALL NOT exceed `0.30`
4. THE SFX_Pipeline SHALL use volume values from `SCENE_SFX_MAP` without modification (the map already respects these constraints)

### Requirement 10: Graceful Degradation

**User Story:** As a user, I want my video to still render successfully even if SFX processing encounters issues, so that a missing sound file does not block video delivery.

#### Acceptance Criteria

1. IF SFX staging fails for a non-critical reason (file not found for a single utility sound), THEN THE Video_Renderer SHALL log a warning and continue rendering without that specific SFX file
2. IF all SFX staging fails (no SFX files can be copied), THEN THE Video_Renderer SHALL log a warning and render the video with voiceover only (no SFX)
3. THE Video_Renderer SHALL NOT return `Result.fail()` due to SFX-related issues unless the failure also affects voiceover or visual rendering
4. IF a scene type is not present in `SCENE_SFX_MAP`, THEN THE Code_Composer SHALL skip SFX for that scene without error
