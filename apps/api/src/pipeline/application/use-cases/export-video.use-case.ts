import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

interface ExportVideoRequest {
  jobId: string;
}

export class ExportVideoUseCase
  implements UseCase<ExportVideoRequest, Result<void, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(
    request: ExportVideoRequest,
  ): Promise<Result<void, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    if (job.stage.value !== "preview") {
      return Result.fail(
        new ValidationError(
          `Job must be in "preview" stage to export, currently in "${job.stage.value}"`,
          "INVALID_STAGE",
        ),
      );
    }

    const transitionResult = job.transitionTo("rendering");
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.getError());
    }

    await this.repository.save(job);

    const enqueueResult = await this.queueService.enqueue({
      stage: "rendering",
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
