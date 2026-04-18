# Requirements Document

## Introduction

The Pixel-Perfect Animation Layout System replaces hardcoded OpenCut-era safe zone constraints (CANVAS_TOP=80, CANVAS_H=1080) that waste ~840px of vertical space on faceless videos. The system introduces layout profiles that define usable canvas regions per video type, a spatial slot system that provides named non-overlapping screen regions for element placement, and a bounding box validator that detects element overlap before rendering. Together, these subsystems eliminate wasted space, prevent animation collisions, and provide an extensible foundation for future layout modes (face cam, split screen, picture-in-picture).

## Glossary

- **Layout_Profile**: A configuration object defining canvas dimensions, safe zone bounds, spatial slots, and metadata for a specific video type
- **Layout_Profile_Registry**: The component that stores and retrieves Layout_Profile objects by video type identifier
- **Safe_Zone**: The rectangular region within the full canvas where animated content may be placed, defined by top, left, width, and height offsets
- **Slot**: A named, non-overlapping rectangular region within the safe zone used to assign spatial positions to animation beats
- **Slot_Map**: A collection of named Slot definitions for a given Layout_Profile
- **Bounding_Box**: A rectangular region describing an element's position and size, both in its initial state and after animation transforms are applied
- **Bounding_Box_Validator**: The component that performs static analysis on generated Remotion code to detect element overlap before rendering
- **Overlap_Violation**: A detected instance where two sibling elements occupy overlapping screen regions during animation
- **Direction_Generator**: The AI component that produces detailed animation directions (beats, colors, motion specs, typography, SFX) for each scene
- **Code_Generator**: The AI component that produces React/Remotion component code from scene directions
- **Slot_Assignment**: The mapping of a specific animation beat to a named slot within the active layout profile
- **Reserved_Region**: An area of the canvas excluded from the safe zone, reserved for overlays such as face cam or picture-in-picture
- **Video_Type**: The layout category for a video — currently "faceless" (resolved automatically at runtime), with future support for "facecam", "split-screen", and "pip"

## Requirements

### Requirement 1: Layout Profile Definition and Storage

**User Story:** As a pipeline developer, I want layout profiles to define canvas dimensions, safe zones, and spatial slots for each video type, so that the system uses the correct layout constraints instead of hardcoded values.

#### Acceptance Criteria

1. THE Layout_Profile SHALL contain a canvas object with width and height, a safeZone object with top, left, width, and height, a slots field containing a Slot_Map, and a metadata object with a description
2. THE Layout_Profile SHALL validate that the safeZone fits entirely within the canvas bounds
3. THE Layout_Profile SHALL validate that all Slots in the Slot_Map fit within the safeZone dimensions
4. THE Layout_Profile SHALL validate that no two Slots in the same Slot_Map overlap

### Requirement 2: Layout Profile Registry and Resolution

**User Story:** As a pipeline developer, I want to look up the correct layout profile by video type, so that each pipeline stage uses the appropriate canvas constraints for the video being generated.

#### Acceptance Criteria

1. WHEN a video type identifier is provided, THE Layout_Profile_Registry SHALL return the corresponding Layout_Profile
2. WHEN an unrecognized video type identifier is provided, THE Layout_Profile_Registry SHALL return the "faceless" Layout_Profile as the default and log a warning
3. THE Layout_Profile_Registry SHALL provide a "faceless" profile with canvas 1080×1920, safeZone starting at top 0 with left padding 44, usable width 992, and full height 1920
4. THE Layout_Profile_Registry SHALL provide a "facecam" profile with canvas 1080×1920, safeZone starting at top 80 with left padding 44, usable width 992, and height 1080, with a reserved region for the face cam area
5. THE Layout_Profile_Registry SHALL list all registered profiles

### Requirement 3: Spatial Slot Definition and Resolution

**User Story:** As a pipeline developer, I want named spatial slots within each layout profile, so that the Direction Generator can assign beats to non-overlapping screen regions and the Code Generator can map those slots to pixel coordinates.

#### Acceptance Criteria

1. THE Slot SHALL contain an id, a human-readable label, bounds (top, left, width, height relative to the safe zone origin), and an allowOverflow flag
2. THE "faceless" Layout_Profile SHALL define five slots: "top-banner" (0–160px), "top-third" (160–640px), "center" (640–1280px), "bottom-third" (1280–1760px), and "bottom-banner" (1760–1920px)
3. WHEN a Slot_Assignment references a slot id, THE Slot_Map SHALL resolve the slot to its pixel-coordinate bounds within the safe zone
4. THE Slot_Map SHALL reject any Slot_Assignment that references a slot id not present in the active profile

### Requirement 4: Direction Generator Layout Integration

**User Story:** As a pipeline developer, I want the Direction Generator to receive layout profile context and assign beats to spatial slots, so that animation directions use dynamic canvas dimensions instead of hardcoded safe zone values.

#### Acceptance Criteria

1. WHEN generating scene directions, THE Direction_Generator SHALL accept a Layout_Profile parameter and inject the profile's canvas dimensions and safe zone bounds into the AI system prompt
2. WHEN generating scene directions, THE Direction_Generator SHALL include the slot vocabulary (slot ids, labels, and pixel bounds) from the Layout_Profile in the AI system prompt
3. WHEN the Direction_Generator produces a SceneDirection, each Beat SHALL include a slot field referencing a valid slot id from the active Layout_Profile
4. IF the Direction_Generator returns a Beat with an invalid slot id, THEN THE Direction_Generator SHALL auto-correct the slot assignment based on the beat's position in the scene (first beat → top slot, last beat → bottom slot, middle beats → center) and log a warning
5. THE Direction_Generator SHALL replace all hardcoded safe zone values (top=80, height=1080) in the AI prompt with dynamic values from the Layout_Profile

### Requirement 5: Code Generator Layout Integration

**User Story:** As a pipeline developer, I want the Code Generator to receive layout profile context and use slot-to-pixel mappings, so that generated Remotion code positions elements within the correct canvas regions instead of using hardcoded CANVAS_TOP and CANVAS_H constants.

#### Acceptance Criteria

1. WHEN generating Remotion code, THE Code_Generator SHALL accept a Layout_Profile parameter and inject the profile's safe zone dimensions into the AI system prompt
2. WHEN generating Remotion code, THE Code_Generator SHALL include a slot-to-pixel coordinate mapping table from the Layout_Profile in the AI system prompt
3. THE Code_Generator SHALL replace all hardcoded layout constants (CANVAS_TOP=80, CANVAS_H=1080) in the AI prompt with dynamic values from the Layout_Profile's safeZone
4. THE Code_Generator SHALL instruct the AI to position each beat's content within its assigned slot bounds
5. THE Code_Generator SHALL instruct the AI that animated transforms (translateY, scale) must not push content outside slot bounds

### Requirement 6: Bounding Box Validation

**User Story:** As a pipeline developer, I want generated Remotion code to be validated for element overlap before rendering, so that animation collisions are detected and corrected without wasting rendering resources.

#### Acceptance Criteria

1. WHEN generated Remotion code is available, THE Bounding_Box_Validator SHALL parse the code to extract element positions and animation transforms using static analysis
2. THE Bounding_Box_Validator SHALL compute animated bounding boxes by applying interpolation and spring transforms to initial element positions
3. THE Bounding_Box_Validator SHALL detect pairwise overlap between sibling elements within the same scene
4. WHEN overlap area between two elements is less than 10% of the smaller element's area, THE Bounding_Box_Validator SHALL classify the violation as severity "warning"
5. WHEN overlap area between two elements is 10% or more of the smaller element's area, THE Bounding_Box_Validator SHALL classify the violation as severity "error"
6. THE Bounding_Box_Validator SHALL produce a ValidationResult containing a valid flag, a list of OverlapViolation objects, the computed BoundingBox list, and a human-readable summary
7. THE Bounding_Box_Validator SHALL detect elements positioned outside the safe zone defined by the Layout_Profile and report them as violations

### Requirement 7: Validation-Driven Code Regeneration

**User Story:** As a pipeline developer, I want the pipeline to retry code generation with overlap feedback when validation fails, so that layout violations are corrected automatically before rendering.

#### Acceptance Criteria

1. WHEN the Bounding_Box_Validator reports one or more "error" severity violations, THE Pipeline SHALL retry code generation with the overlap report summary injected into the Code_Generator prompt
2. THE Pipeline SHALL retry code generation up to 2 times when validation fails, consistent with the existing retry policy
3. IF all retry attempts produce code that fails validation, THEN THE Pipeline SHALL mark the job as failed with error code "code_generation_failed" and include the overlap summary in the error message
4. WHEN the Bounding_Box_Validator reports only "warning" severity violations, THE Pipeline SHALL proceed to rendering without retry

### Requirement 8: Layout Profile Runtime Resolution in Workers

**User Story:** As a pipeline developer, I want the pipeline workers to resolve the layout profile at runtime and pass it to the Direction Generator and Code Generator, so that layout context flows through the pipeline without requiring schema changes to the job record.

#### Acceptance Criteria

1. WHEN the direction generation worker processes a job, THE worker SHALL resolve the Layout_Profile from the Layout_Profile_Registry using the video type (currently always "faceless") and pass the profile to the Direction_Generator
2. WHEN the code generation worker processes a job, THE worker SHALL resolve the Layout_Profile from the Layout_Profile_Registry using the video type (currently always "faceless") and pass the profile to the Code_Generator
3. WHEN the code generation worker processes a job, THE worker SHALL invoke the Bounding_Box_Validator on the generated code before proceeding to the rendering stage
4. THE Pipeline SHALL resolve the layout profile at runtime without persisting a layout profile identifier in the job record

