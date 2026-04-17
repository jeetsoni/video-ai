import type { PipelineStage } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface QueueService {
  enqueue(params: {
    stage: PipelineStage;
    jobId: string;
  }): Promise<Result<void, PipelineError>>;
}
