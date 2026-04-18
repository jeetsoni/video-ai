# Implementation Plan: Pixel-Perfect Animation Layout System

## Overview

Replace hardcoded OpenCut-era safe zone constraints with a dynamic layout profile system. Implementation proceeds bottom-up: shared types and layout profile presets first, then the bounding box validator service, followed by modifications to the direction generator and code generator (port interfaces + infrastructure), worker integration, and finally the validation-driven retry loop in the code generation worker.

## Tasks

- [x] 1. Shared package — layout types and profile presets
  - [x] 1.1 Define layout profile types in shared package
    - Create `packages/shared/src/types/layout.types.ts` with `LayoutProfile`, `Slot`, `SlotMap`, `ReservedRegion`, `BoundingBox`, `AnimationTransform`, `OverlapViolation`, and `ValidationResult` interfaces
    - Add optional `slot?: string` field to the existing `SceneBeat` interface in `packages/shared/src/types/pipeline.types.ts`
    - Export all new types from `packages/shared/src/index.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 1.2 Create layout profile presets and registry
    - Create `packages/shared/src/layout/layout-profiles.ts` with `FACELESS_PROFILE` and `FACECAM_PROFILE` constants matching the design spec dimensions
    - Implement `getLayoutProfile(videoType: string): LayoutProfile` that returns the matching profile or falls back to faceless with a console warning
    - Implement `listLayoutProfiles(): LayoutProfile[]` that returns all registered profiles
    - Export registry functions and profile constants from `packages/shared/src/index.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.2_

  - [x] 1.3 Add layout profile validation functions
    - Create `packages/shared/src/layout/layout-validation.ts` with `validateSafeZone(profile: LayoutProfile): boolean` (safe zone fits within canvas), `validateSlotMap(profile: LayoutProfile): boolean` (all slots fit within safe zone), and `validateSlotNonOverlap(profile: LayoutProfile): boolean` (no two slots overlap)
    - Export validation functions from `packages/shared/src/index.ts`
    - _Requirements: 1.2, 1.3, 1.4_


  - [ ]* 1.4 Write property test: safe zone containment within canvas
    - **Property 1: Safe zone containment within canvas**
    - Generate arbitrary LayoutProfile objects with random canvas and safeZone dimensions; verify `validateSafeZone` accepts profiles where safeZone fits and rejects profiles where it does not
    - **Validates: Requirement 1.2**

  - [ ]* 1.5 Write property test: slot containment within safe zone
    - **Property 2: Slot containment within safe zone**
    - Generate arbitrary LayoutProfile objects with valid safe zones and random SlotMap entries; verify `validateSlotMap` accepts slot maps where all slots fit and rejects slot maps where any slot exceeds the safe zone
    - **Validates: Requirement 1.3**

  - [ ]* 1.6 Write property test: slot non-overlap invariant
    - **Property 3: Slot non-overlap invariant**
    - Generate arbitrary SlotMap objects with two or more slots; verify `validateSlotNonOverlap` detects and rejects any slot map where a pairwise overlap exists
    - **Validates: Requirement 1.4**

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Bounding box validator service
  - [x] 3.1 Create the LayoutValidator port interface
    - Create `apps/api/src/pipeline/application/interfaces/layout-validator.ts` with the `LayoutValidator` interface: `validate(params: { code: string; layoutProfile: LayoutProfile; scenePlan: ScenePlan }): Promise<Result<ValidationResult, PipelineError>>`
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 3.2 Implement the bounding box validator service
    - Create `apps/api/src/pipeline/infrastructure/services/layout-validator.ts` implementing `LayoutValidator`
    - Implement static analysis to extract element positions and animation transforms (interpolate, spring, translateY, translateX, scale) from generated Remotion code using regex/string parsing
    - Implement animated bounding box computation by applying extracted transforms to initial positions
    - Implement pairwise overlap detection between sibling elements within the same scene
    - Implement out-of-bounds detection for elements positioned outside the safe zone
    - Classify violations: "warning" when overlap area < 10% of smaller element's area, "error" when ≥ 10%
    - Produce a `ValidationResult` with valid flag, violations list, bounding boxes, and human-readable summary
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 3.3 Write property test: animated bounding box computability
    - **Property 5: Animated bounding box computability**
    - Generate arbitrary BoundingBox objects with random initial positions and AnimationTransform sets (translateY, translateX, scale); verify applying transforms always produces finite, non-NaN top, left, width, and height values
    - **Validates: Requirement 6.2**

  - [ ]* 3.4 Write property test: rectangle overlap detection correctness
    - **Property 6: Rectangle overlap detection correctness**
    - Generate arbitrary pairs of rectangles (top, left, width, height); verify the overlap detection function returns true if and only if the rectangles geometrically intersect
    - **Validates: Requirement 6.3**

  - [ ]* 3.5 Write property test: overlap severity classification
    - **Property 7: Overlap severity classification**
    - Generate arbitrary pairs of overlapping bounding boxes; verify classification is "warning" when overlap area < 10% of smaller element's area and "error" when ≥ 10%
    - **Validates: Requirements 6.4, 6.5**

  - [ ]* 3.6 Write property test: out-of-bounds element detection
    - **Property 8: Out-of-bounds element detection**
    - Generate arbitrary BoundingBox objects whose animated positions extend beyond the safe zone bounds; verify the validator detects and reports them as violations
    - **Validates: Requirement 6.7**

  - [ ]* 3.7 Write property test: non-overlapping slot assignments produce zero violations
    - **Property 9: Non-overlapping slot assignments produce zero violations**
    - Generate arbitrary sets of elements where each element is positioned entirely within its assigned slot bounds and all slots are non-overlapping; verify the validator reports zero overlap violations
    - **Validates: Requirements 6.3, 6.6**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Direction generator — layout profile integration
  - [x] 5.1 Update the DirectionGenerator port interface
    - Update `apps/api/src/pipeline/application/interfaces/direction-generator.ts` to add `layoutProfile: LayoutProfile` to the `generateDirection` params
    - _Requirements: 4.1_

  - [x] 5.2 Update AIDirectionGenerator to accept and use LayoutProfile
    - Modify `apps/api/src/pipeline/infrastructure/services/ai-direction-generator.ts`:
    - Update `buildDirectionSystemPrompt` to accept `LayoutProfile` and inject dynamic canvas dimensions and safe zone bounds from the profile instead of hardcoded values (replace `top=80 to y=1150 (1080px tall, 992px wide)` with profile values)
    - Add slot vocabulary section to the system prompt listing available slot IDs, labels, and pixel bounds from the profile's SlotMap
    - Instruct the AI to assign each beat a `slot` field from the available slots
    - Update the JSON response schema in the prompt to include `slot` in each beat
    - Implement auto-correction for invalid slot assignments: first beat → first slot, last beat → last slot, middle beats → center slot; log a warning
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.3 Write property test: beat slot assignment validity after auto-correction
    - **Property 4: Beat slot assignment validity after auto-correction**
    - Generate arbitrary SceneDirection objects with random (possibly invalid) slot assignments and arbitrary LayoutProfile objects; verify that after auto-correction every beat's slot field references a valid slot id present in the profile's SlotMap
    - **Validates: Requirements 4.3, 4.4**

- [x] 6. Code generator — layout profile integration
  - [x] 6.1 Update the CodeGenerator port interface
    - Update `apps/api/src/pipeline/application/interfaces/code-generator.ts` to add `layoutProfile: LayoutProfile` to the `generateCode` params
    - _Requirements: 5.1_

  - [x] 6.2 Update AICodeGenerator to accept and use LayoutProfile
    - Modify `apps/api/src/pipeline/infrastructure/services/ai-code-generator.ts`:
    - Update `buildCodeSystemPrompt` to accept `LayoutProfile` and replace hardcoded `CANVAS_TOP=80, CANVAS_H=1080` with dynamic values from `layoutProfile.safeZone`
    - Add a slot-to-pixel coordinate mapping table to the system prompt from the profile's SlotMap
    - Add layout rules: each beat's content must be positioned within its assigned slot bounds; animated transforms must not push content outside slot bounds
    - Update the component structure template to use profile-driven values instead of magic numbers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Worker integration — layout profile resolution and validation
  - [x] 7.1 Update direction generation worker
    - Modify `apps/api/src/pipeline/infrastructure/queue/workers/direction-generation.worker.ts`:
    - Import `getLayoutProfile` from `@video-ai/shared`
    - Resolve the layout profile using `getLayoutProfile("faceless")` (hardcoded for now, future: derive from job)
    - Pass the resolved `layoutProfile` to `directionGenerator.generateDirection()`
    - _Requirements: 8.1, 8.4_

  - [x] 7.2 Update code generation worker with validation loop
    - Modify `apps/api/src/pipeline/infrastructure/queue/workers/code-generation.worker.ts`:
    - Import `getLayoutProfile` from `@video-ai/shared`
    - Accept a `LayoutValidator` dependency in the constructor
    - Resolve the layout profile using `getLayoutProfile("faceless")`
    - Pass the resolved `layoutProfile` to `codeGenerator.generateCode()`
    - After code generation, invoke `layoutValidator.validate()` on the generated code
    - If validation returns only "warning" severity violations, proceed to rendering
    - If validation returns "error" severity violations, retry code generation (up to 2 retries) with the overlap report summary injected into the prompt
    - If all retries fail validation, mark the job as failed with error code `code_generation_failed` and include the overlap summary in the error message
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.2, 8.3, 8.4_

  - [x] 7.3 Update worker registry to wire LayoutValidator
    - Modify `apps/api/src/pipeline/infrastructure/queue/worker-registry.ts`:
    - Instantiate the `LayoutValidator` implementation
    - Pass it to the `CodeGenerationWorker` constructor
    - _Requirements: 8.3_

  - [ ]* 7.4 Write unit tests for code generation worker validation loop
    - Test that "warning"-only validation results proceed to rendering without retry
    - Test that "error" validation results trigger retry with overlap feedback
    - Test that exhausted retries mark the job as failed with overlap summary
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties from the design document
- The implementation language is TypeScript, matching the existing codebase
- Layout profile resolution currently hardcodes "faceless" — future video types will derive from the job record
- No schema changes to PipelineJob are required; layout profiles are resolved at runtime
