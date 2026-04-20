import type { PipelineStage, PipelineStatus } from "./pipeline.types.js";

export interface SceneProgressInfo {
  sceneId: number;
  sceneName: string;
  status: "generating" | "completed" | "failed";
  /** The generated code for this scene (only present when status is "completed") */
  code?: string;
}

export interface ProgressEventData {
  stage: PipelineStage;
  status: PipelineStatus;
  progressPercent: number;
  errorCode?: string;
  errorMessage?: string;
  /** Per-scene progress during code_generation stage */
  sceneProgress?: SceneProgressInfo;
}

export interface ProgressEvent {
  type: "progress";
  seq: number;
  data: ProgressEventData;
}

export function isTerminalStatus(status: PipelineStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "awaiting_script_review"
  );
}
