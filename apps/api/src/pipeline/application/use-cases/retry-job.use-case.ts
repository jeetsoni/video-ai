import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import { isProcessingStage } from "@/pipeline/infrastructure/queue/pipeline-queue.js";
import type { PipelineStage } from "@video-ai/shared";

interface RetryJobRequest {
  jobId: string;
}

export class RetryJobUseCase
  implements UseCase<RetryJobRequest, Result<void, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(
    request: RetryJobRequest,
  ): Promise<Result<void, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    // Allow retry for failed jobs and stuck processing jobs
    if (job.status.value !== "failed" && job.status.value !== "processing") {
      return Result.fail(
        new ValidationError(
          `Job is in "${job.status.value}" status, expected "failed" or "processing"`,
          "CONFLICT",
        ),
      );
    }

    const stage = job.stage.value as PipelineStage;

    if (!isProcessingStage(stage)) {
      return Result.fail(
        new ValidationError(
          `Cannot retry from non-processing stage "${stage}"`,
          "CONFLICT",
        ),
      );
    }

    // Clear any failed status so the job can be re-processed
    job.clearFailure();

    await this.repository.save(job);

    const enqueueResult = await this.queueService.enqueue({
      stage,
      jobId: job.id,
    });

    if (enqueueResult.isFailure) {
      return Result.fail(
        new ValidationError(enqueueResult.getError().message, "QUEUE_ERROR"),
      );
    }

    return Result.ok(undefined);
  }
}
