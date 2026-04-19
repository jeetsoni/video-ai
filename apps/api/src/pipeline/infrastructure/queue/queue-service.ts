import type { Queue } from "bullmq";
import type { PipelineStage } from "@video-ai/shared";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { Result } from "@/shared/domain/result.js";
import { Result as ResultClass } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { STAGE_RETRY_CONFIG, isProcessingStage } from "./pipeline-queue.js";

export class BullMQQueueService implements QueueService {
  constructor(private readonly queue: Queue) {}

  async enqueue(params: {
    stage: PipelineStage;
    jobId: string;
  }): Promise<Result<void, PipelineError>> {
    const { stage, jobId } = params;

    if (!isProcessingStage(stage)) {
      return ResultClass.fail(
        new PipelineError(
          `Stage "${stage}" is not a processing stage and cannot be enqueued`,
          "script_generation_failed"
        )
      );
    }

    try {
      const retryConfig = STAGE_RETRY_CONFIG[stage];

      await this.queue.add(stage, { jobId }, {
        jobId: `${jobId}--${stage}--${Date.now()}`,
        attempts: retryConfig.attempts,
        backoff: retryConfig.backoff,
      });

      return ResultClass.ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown queue error";
      return ResultClass.fail(
        new PipelineError(`Failed to enqueue stage "${stage}": ${message}`, "script_generation_failed")
      );
    }
  }
}
