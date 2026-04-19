# Requirements Document

## Introduction

The Virtual Camera System replaces the current hard-cut scene transitions with a continuous cinematic camera that pans, zooms, and tracks across a large world canvas. All scene content is rendered simultaneously on a shared canvas, and a virtual camera interpolates between spatial positions to create smooth, ByteMonk-quality transitions. This eliminates the isolated `<Sequence>` block pattern and produces videos that feel like one continuous shot.

## Glossary

- **World_Canvas**: A large coordinate space (dynamically sized based on scene count and layout) where all scene content is positioned simultaneously. Each scene occupies a distinct region.
- **Virtual_Camera**: A transform wrapper that applies `translate(x, y) scale(s)` to the World_Canvas, creating the illusion of a camera panning and zooming across the content.
- **Camera_Keyframe**: A data point specifying the camera's position (x, y) and scale at a given frame number. The camera interpolates between keyframes.
- **Scene_Region**: The rectangular area on the World_Canvas assigned to a specific scene's content.
- **Camera_Movement**: A transition between two Camera_Keyframes, characterized by type (pan, zoom_in, zoom_out, pull_back, track).
- **Direction_Generator**: The AI service that produces animation directions for each scene, including spatial placement and camera movement instructions.
- **Code_Generator**: The AI service that produces Remotion JSX code from a ScenePlan, rendering the camera wrapper and world canvas.
- **Scene_Plan**: The complete data structure containing all scenes, their directions, timing, and camera metadata passed to the generated Remotion component.
- **Easing_Function**: A mathematical function controlling the acceleration curve of camera movements (e.g., ease-in-out, spring).

## Requirements

### Requirement 1: World Canvas Spatial Layout

**User Story:** As a video creator, I want all scene content placed on a shared world canvas with distinct spatial regions, so that the camera can reveal content by moving rather than cutting.

#### Acceptance Criteria

1. THE Direction_Generator SHALL assign each scene a Scene_Region with x, y, width, and height coordinates on the World_Canvas.
2. WHEN multiple scenes exist in a Scene_Plan, THE Direction_Generator SHALL position Scene_Regions without overlap, maintaining a minimum gap of 100px between adjacent regions.
3. THE Direction_Generator SHALL compute the World_Canvas dimensions dynamically based on the total number of scenes and their assigned regions.
4. WHEN a scene has type "Hook", THE Direction_Generator SHALL position its Scene_Region at the origin (0, 0) of the World_Canvas.
5. THE Direction_Generator SHALL assign Scene_Regions in a spatial arrangement that reflects narrative flow (e.g., left-to-right for sequential scenes, clustered for related scenes).

### Requirement 2: Camera Keyframe Generation

**User Story:** As a video creator, I want the direction generator to produce camera keyframes for each scene, so that the camera knows where to move and when.

#### Acceptance Criteria

1. THE Direction_Generator SHALL produce at least one Camera_Keyframe per scene, specifying x, y, scale, and the frame at which the camera arrives.
2. WHEN a scene begins, THE Camera_Keyframe SHALL frame the scene's Scene_Region such that the region fills 80-95% of the viewport.
3. THE Direction_Generator SHALL produce a Camera_Keyframe at frame 0 that positions the camera over the first scene's Scene_Region.
4. WHEN transitioning between scenes, THE Direction_Generator SHALL specify a Camera_Movement type (pan, zoom_in, zoom_out, pull_back, track) appropriate to the narrative transition.
5. THE Direction_Generator SHALL ensure camera keyframe timing aligns with scene startFrame and endFrame boundaries from the Scene_Plan.

### Requirement 3: Camera Movement Interpolation

**User Story:** As a video creator, I want smooth camera movements between scenes, so that transitions feel cinematic rather than jarring.

#### Acceptance Criteria

1. THE Virtual_Camera SHALL interpolate position (x, y) and scale between consecutive Camera_Keyframes using an Easing_Function.
2. THE Virtual_Camera SHALL complete each Camera_Movement within a configurable transition duration (default: 20 frames).
3. WHEN a Camera_Movement type is "pan", THE Virtual_Camera SHALL translate horizontally or vertically without changing scale.
4. WHEN a Camera_Movement type is "zoom_in", THE Virtual_Camera SHALL increase scale while centering on the target Scene_Region.
5. WHEN a Camera_Movement type is "zoom_out" or "pull_back", THE Virtual_Camera SHALL decrease scale to reveal more of the World_Canvas before moving to the next scene.
6. THE Virtual_Camera SHALL use spring-based easing (damping: 14, stiffness: 120) as the default Easing_Function for Camera_Movements.

### Requirement 4: Scene Content Persistence

**User Story:** As a video creator, I want previous scene content to remain visible in the background as the camera moves away, so that the video feels like one continuous world.

#### Acceptance Criteria

1. THE Code_Generator SHALL render all scene content simultaneously on the World_Canvas regardless of the current camera position.
2. WHILE the Virtual_Camera is positioned over a Scene_Region, THE Code_Generator SHALL render content from adjacent Scene_Regions at their World_Canvas positions.
3. WHEN the Virtual_Camera moves away from a Scene_Region, THE Code_Generator SHALL keep that scene's content rendered at reduced opacity (0.3-0.5) or at its natural state depending on distance.
4. IF the World_Canvas contains more than 8 scenes, THEN THE Code_Generator SHALL apply visibility culling to scenes more than 2 regions away from the current camera position to maintain rendering performance.

### Requirement 5: Code Generator Camera Wrapper

**User Story:** As a video creator, I want the generated Remotion code to use a camera wrapper pattern instead of isolated Sequence blocks, so that the virtual camera system is rendered correctly.

#### Acceptance Criteria

1. THE Code_Generator SHALL produce a Remotion component that wraps all scene content in a single transform container applying the Virtual_Camera's current translate and scale.
2. THE Code_Generator SHALL compute the Virtual_Camera transform on every frame using `useCurrentFrame()` and the Camera_Keyframe data from the Scene_Plan.
3. THE Code_Generator SHALL position each scene's content at its Scene_Region coordinates using absolute positioning within the World_Canvas container.
4. THE Code_Generator SHALL apply `will-change: transform` to the camera wrapper element for GPU-accelerated rendering.
5. WHEN generating code, THE Code_Generator SHALL use `interpolate()` with clamped extrapolation to compute camera position between keyframes.

### Requirement 6: Scene Plan Schema Extension

**User Story:** As a developer, I want the ScenePlan type to include camera and spatial data, so that the pipeline can pass camera information from direction generation to code generation.

#### Acceptance Criteria

1. THE Scene_Plan SHALL include a `worldCanvas` field specifying the total width and height of the World_Canvas.
2. THE Scene_Plan SHALL include a `cameraKeyframes` array containing all Camera_Keyframes ordered by frame number.
3. Each SceneDirection in the Scene_Plan SHALL include a `region` field specifying the scene's x, y, width, and height on the World_Canvas.
4. Each Camera_Keyframe SHALL contain fields: `frame` (number), `x` (number), `y` (number), `scale` (number), `easing` (string), and `movementType` (Camera_Movement type).
5. THE Scene_Plan SHALL remain backward-compatible by making camera fields optional, allowing non-camera videos to render with the existing Sequence pattern.

### Requirement 7: Direction Generator Prompt Enhancement

**User Story:** As a developer, I want the direction generator's system prompt to instruct the LLM to think in world-canvas coordinates, so that spatial placement and camera movements are generated correctly.

#### Acceptance Criteria

1. THE Direction_Generator SHALL include world-canvas spatial planning instructions in its system prompt.
2. THE Direction_Generator SHALL instruct the LLM to output a `region` field (x, y, width, height) for each scene in its JSON response.
3. THE Direction_Generator SHALL instruct the LLM to output `cameraKeyframes` specifying where the camera should be at the start and end of each scene.
4. THE Direction_Generator SHALL provide the LLM with the list of available Camera_Movement types and guidance on when to use each type.
5. WHEN a previous scene direction is provided, THE Direction_Generator SHALL include the previous scene's region coordinates so the LLM can plan spatial continuity.

### Requirement 8: Client-Side Preview Compatibility

**User Story:** As a video creator, I want the camera system to work in the browser-based preview, so that I can see the camera movements before rendering.

#### Acceptance Criteria

1. THE Code_Generator SHALL produce code that is compatible with the client-side code evaluator (using only globals available in the evaluator sandbox: React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing).
2. THE Virtual_Camera transform logic SHALL be implemented using only inline styles and the `interpolate` function from Remotion (no external dependencies).
3. WHEN previewing in the browser, THE Virtual_Camera SHALL render at the same frame rate and with the same easing as the server-side render.
4. IF the World_Canvas exceeds 8000px in either dimension, THEN THE Code_Generator SHALL apply `transform-origin: 0 0` to prevent browser rendering artifacts.

### Requirement 9: Camera Primitive Component

**User Story:** As a developer, I want a reusable VirtualCamera primitive component added to the primitives library, so that the LLM can compose it reliably without writing camera logic from scratch.

#### Acceptance Criteria

1. THE remotion-primitives library SHALL include a `VirtualCamera` component that accepts `keyframes`, `children`, and `frame` as props.
2. THE VirtualCamera component SHALL compute the current camera x, y, and scale by interpolating between the two nearest keyframes based on the current frame.
3. THE VirtualCamera component SHALL apply `transform: translate(x, y) scale(scale)` with `transformOrigin: '0 0'` to a wrapper div containing all children.
4. THE VirtualCamera component SHALL use spring-based interpolation when the keyframe specifies `easing: 'spring'` and linear interpolation for `easing: 'linear'`.
5. THE Code_Generator system prompt SHALL document the VirtualCamera primitive with usage examples so the LLM can use it correctly.

### Requirement 10: Graceful Fallback

**User Story:** As a developer, I want the system to fall back to the existing Sequence-based rendering when camera data is absent, so that existing videos continue to work.

#### Acceptance Criteria

1. WHEN the Scene_Plan does not contain a `cameraKeyframes` field, THE Code_Generator SHALL render scenes using the existing isolated Sequence block pattern.
2. WHEN the Scene_Plan does not contain `region` fields on scenes, THE Code_Generator SHALL use the existing slot-based layout system.
3. IF the Direction_Generator fails to produce valid camera keyframes, THEN THE pipeline SHALL fall back to generating directions without camera data and log a warning.
4. THE Code_Generator system prompt SHALL include instructions to detect the presence of camera data and choose the appropriate rendering pattern.
