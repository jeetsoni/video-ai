export type {
  VideoFormat,
  PipelineStatus,
  PipelineStage,
  PipelineErrorCode,
  WordTimestamp,
  SceneBoundary,
  SceneBeat,
  SceneDirection,
  AnimationTheme,
  ScenePlan,
  PipelineJobDto,
} from "./types/pipeline.types.js";

export { FORMAT_WORD_RANGES, FORMAT_RESOLUTIONS } from "./types/format-config.js";

export {
  createPipelineJobSchema,
  approveScriptSchema,
  wordTimestampSchema,
  sceneBoundarySchema,
  sceneBoundariesResponseSchema,
  sceneBlockSchema,
  structuredScriptResponseSchema,
} from "./schemas/pipeline.schema.js";

export {
  chunkEventSchema,
  sceneEventSchema,
  doneEventSchema,
  errorEventSchema,
  scriptStreamEventSchema,
} from "./schemas/script-stream-event.schema.js";

export type {
  ScriptStreamEvent,
  ChunkEvent,
  SceneEvent,
  DoneEvent,
  ErrorEvent,
} from "./schemas/script-stream-event.schema.js";

export { ANIMATION_THEMES, DEFAULT_THEME_ID } from "./themes/animation-themes.js";

export type {
  LayoutProfile,
  ReservedRegion,
  Slot,
  SlotMap,
  BoundingBox,
  AnimationTransform,
  OverlapViolation,
  ValidationResult,
} from "./types/layout.types.js";

export {
  FACELESS_PROFILE,
  FACECAM_PROFILE,
  getLayoutProfile,
  listLayoutProfiles,
} from "./layout/layout-profiles.js";

export {
  validateSafeZone,
  validateSlotMap,
  validateSlotNonOverlap,
} from "./layout/layout-validation.js";

export type {
  ProgressEvent,
  ProgressEventData,
} from "./types/pipeline-progress.types.js";

export { isTerminalStatus } from "./types/pipeline-progress.types.js";
