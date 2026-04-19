# Implementation Plan: Virtual Camera System

## Overview

Transform the video generation pipeline from isolated Sequence-based scene rendering into a continuous cinematic camera system. Implementation proceeds bottom-up: types first, then the VirtualCamera primitive, then direction generator enhancements, code generator enhancements, and finally wiring through the code generation worker. Each step builds on the previous and ends with full integration.

## Tasks

- [x] 1. Define camera types and extend ScenePlan schema
  - [x] 1.1 Add CameraKeyframe, CameraMovementType, SceneRegion types and extend ScenePlan/SceneDirection in `packages/shared/src/types/pipeline.types.ts`
    - Add `CameraMovementType` union type: `'pan' | 'zoom_in' | 'zoom_out' | 'pull_back' | 'track'`
    - Add `CameraKeyframe` interface with fields: `frame`, `x`, `y`, `scale`, `easing: 'spring' | 'linear'`, `movementType: CameraMovementType`
    - Add `SceneRegion` interface with fields: `x`, `y`, `width`, `height`
    - Add optional `region?: SceneRegion` to `SceneDirection`
    - Add optional `worldCanvas?: { width: number; height: number }` to `ScenePlan`
    - Add optional `cameraKeyframes?: CameraKeyframe[]` to `ScenePlan`
    - All new fields must be optional to maintain backward compatibility
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.2 Export new types from `packages/shared/src/index.ts`
    - Add `CameraKeyframe`, `CameraMovementType`, `SceneRegion` to the type exports from `pipeline.types.js`
    - _Requirements: 6.4_

  - [ ]* 1.3 Write property test for keyframe ordering (Property 5)
    - **Property 5: Camera keyframes are ordered by frame number**
    - Generate random `CameraKeyframe[]` arrays, verify `keyframes[i].frame <= keyframes[i+1].frame` for all valid indices
    - **Validates: Requirements 6.2**

  - [ ]* 1.4 Write property test for world canvas bounds (Property 2)
    - **Property 2: World canvas bounds encompass all scene regions**
    - Generate random sets of `SceneRegion`, verify computed world canvas `width >= max(region.x + region.width)` and `height >= max(region.y + region.height)`
    - **Validates: Requirements 1.3**

  - [ ]* 1.5 Write property test for scene region non-overlap (Property 1)
    - **Property 1: Scene regions do not overlap and maintain minimum gap**
    - Generate random scene counts (2-12) and region placements, verify no two regions overlap and minimum 100px gap between adjacent edges
    - **Validates: Requirements 1.2**

- [x] 2. Implement VirtualCamera primitive
  - [x] 2.1 Add VirtualCamera component to `apps/api/src/pipeline/infrastructure/services/remotion-primitives.ts`
    - Create a `VirtualCamera` function component accepting `keyframes` (CameraKeyframe[]), `children`, and `frame` (number)
    - Interpolate between the two nearest keyframes to compute current x, y, scale
    - Apply `transform: translate(-${x}px, -${y}px) scale(${scale})` with `transformOrigin: '0 0'`
    - Support `easing: 'spring'` (using `spring()` with damping: 14, stiffness: 120) and `easing: 'linear'` (using `interpolate()`)
    - Apply `will-change: transform` for GPU acceleration
    - Handle edge cases: empty keyframes → identity (0, 0, scale 1); frame before first keyframe → first keyframe position; frame after last → last keyframe position; single keyframe → static position
    - Append VirtualCamera to `REMOTION_PRIMITIVES_PART2` or add a new `REMOTION_PRIMITIVES_PART3` string
    - Update `FULL_PRIMITIVES` to include the new primitive
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 3.1, 3.6, 8.1, 8.2_

  - [ ]* 2.2 Write property test for interpolation bounds (Property 6)
    - **Property 6: Camera interpolation produces values between surrounding keyframes**
    - Generate random keyframe pairs and intermediate frames, verify interpolated x, y, scale are between endpoint values (inclusive)
    - **Validates: Requirements 3.1, 9.2**

  - [ ]* 2.3 Write property test for keyframe exactness (Property 7)
    - **Property 7: Camera arrives exactly at keyframe position on keyframe frame**
    - Generate random keyframes, evaluate interpolation at exact keyframe frames, verify exact position and scale match
    - **Validates: Requirements 3.2**

  - [ ]* 2.4 Write property test for movement type scale constraints (Property 8)
    - **Property 8: Movement type constrains scale direction**
    - Generate random consecutive keyframe pairs with movement types, verify: pan → same scale, zoom_in → scale increases, zoom_out/pull_back → scale decreases
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ]* 2.5 Write property test for transform string format (Property 9)
    - **Property 9: VirtualCamera transform string is correctly formatted**
    - Generate random (x, y, scale) values, verify output transform string matches `translate(-${x}px, -${y}px) scale(${scale})` with transformOrigin `'0 0'`
    - **Validates: Requirements 9.3**

  - [ ]* 2.6 Write property test for easing method selection (Property 10)
    - **Property 10: Easing method selection matches keyframe specification**
    - Generate random keyframe pairs with 'spring' and 'linear' easing, verify spring produces non-linear curve and linear produces proportional values
    - **Validates: Requirements 9.4**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Enhance Direction Generator for spatial planning
  - [x] 4.1 Update direction generator system prompt in `apps/api/src/pipeline/infrastructure/services/ai-direction-generator.ts`
    - Add a "World Canvas Spatial Planning" section to `buildDirectionSystemPrompt` instructing the LLM to:
      - Plan a World Canvas layout with non-overlapping scene regions (minimum 100px gap)
      - Output a `region` field (`{ x, y, width, height }`) for each scene in the JSON response
      - Output `cameraKeyframes` specifying camera position at start/end of each scene
      - Position Hook scenes at origin (0, 0)
      - Choose appropriate `CameraMovementType` for each transition
    - Provide the list of available movement types with guidance on when to use each
    - Update the JSON response schema in the prompt to include `region` and camera fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Pass previous scene region in direction prompt
    - Update `buildDirectionPrompt` to include the previous scene's `region` coordinates when `previousDirection` has a region, so the LLM can plan spatial continuity
    - _Requirements: 7.5_

  - [x] 4.3 Add post-processing to aggregate camera data
    - After all scene directions are generated, add logic to:
      - Aggregate per-scene camera keyframes into a single ordered `cameraKeyframes` array
      - Compute `worldCanvas` dimensions from the union of all scene regions
      - Validate regions don't overlap; if they do, attempt auto-correction by shifting regions apart; if auto-correction fails, discard camera data and log a warning
      - Cap world canvas at 16000px in either dimension
    - Parse the `region` and camera keyframe fields from the LLM's JSON output in `parseDirectionJson`
    - _Requirements: 1.2, 1.3, 2.5, 10.3_

  - [ ]* 4.4 Write property test for keyframe-scene alignment (Property 3)
    - **Property 3: Camera keyframe timing aligns with scene boundaries**
    - Generate random scene plans with keyframes, verify each scene has at least one keyframe within [startFrame, endFrame]
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 4.5 Write property test for viewport framing (Property 4)
    - **Property 4: Camera framing fills 80-95% of viewport**
    - Generate random scene regions and corresponding arrival keyframes, verify the region scaled by keyframe scale fills 80-95% of viewport
    - **Validates: Requirements 2.2**

- [x] 5. Enhance Code Generator for camera wrapper pattern
  - [x] 5.1 Update code generator system prompt in `apps/api/src/pipeline/infrastructure/services/ai-code-generator.ts`
    - Add VirtualCamera primitive documentation and usage examples to `buildCodeSystemPrompt`
    - Add instructions to detect `scenePlan.cameraKeyframes` presence
    - Add camera-wrapper rendering pattern: all scenes on a World Canvas with absolute positioning at their region coordinates, wrapped in `VirtualCamera`
    - Add fallback instructions: if no camera data, use existing Sequence pattern
    - Add visibility culling instructions for >8 scenes
    - Add `transform-origin: 0 0` instruction when canvas > 8000px
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 4.1, 4.2, 4.3, 4.4, 8.4, 9.5, 10.1, 10.2, 10.4_

  - [x] 5.2 Update code prompt to include camera data
    - Modify `buildCodePrompt` to include camera-specific instructions when `scenePlan.cameraKeyframes` is present
    - Include the World Canvas dimensions and keyframe data in the prompt
    - _Requirements: 5.1, 5.2_

  - [ ]* 5.3 Write property test for backward compatibility (Property 11)
    - **Property 11: Backward-compatible fallback when camera data is absent**
    - Generate random ScenePlans without `cameraKeyframes` or `region` fields, verify the code generator system prompt selects the Sequence-based pattern
    - **Validates: Requirements 6.5, 10.1, 10.2, 10.3**

- [x] 6. Wire camera data through the code generation worker
  - [x] 6.1 Update ScenePlan construction in `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`
    - When building the `scenePlan` object, include `worldCanvas` and `cameraKeyframes` from the aggregated direction data if present
    - If scene directions contain `region` fields, include them on each scene in the plan
    - If camera data is invalid or missing, build a standard ScenePlan without camera fields (existing behavior)
    - _Requirements: 6.1, 6.2, 6.3, 10.3_

  - [ ]* 6.2 Write unit tests for code generation worker camera data wiring
    - Test that `worldCanvas` and `cameraKeyframes` are included in ScenePlan when direction data has camera fields
    - Test that ScenePlan is built without camera fields when direction data lacks them
    - _Requirements: 6.5, 10.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The design uses TypeScript throughout — all code examples and implementations use TypeScript
- All new schema fields are optional, ensuring full backward compatibility with existing non-camera pipelines
- The VirtualCamera primitive uses only globals already available in the code evaluator sandbox, so no client-side changes are needed
