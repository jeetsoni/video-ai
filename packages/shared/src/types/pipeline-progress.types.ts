import type { PipelineStage, PipelineStatus } from "./pipeline.types.js";

export interface ProgressEventData {
  stage: PipelineStage;
  status: PipelineStatus;
  progressPercent: number;
  errorCode?: string;
  errorMessage?: string;
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
