import type { ScenePlan, VideoFormat } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface VideoRenderer {
  render(params: {
    code: string;
    scenePlan: ScenePlan;
    audioPath: string;
    format: VideoFormat;
  }): Promise<Result<{ videoPath: string }, PipelineError>>;

  renderStill(params: {
    code: string;
    scenePlan: ScenePlan;
    format: VideoFormat;
    jobId: string;
  }): Promise<Result<{ thumbnailPath: string }, PipelineError>>;
}
