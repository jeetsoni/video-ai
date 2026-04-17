import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

interface RegenerateScenePlanRequest {
  jobId: string;
}

export class RegenerateScenePlanUseCase
  implements UseCase<RegenerateScenePlanRequest, Result<void, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(
    request: RegenerateScenePlanRequest,
  ): Promise<Result<void, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    if (job.status.value !== "awaiting_scene_plan_review") {
      return Result.fail(
        new ValidationError(
          `Job is in "${job.status.value}" status, expected "awaiting_scene_plan_review"`,
          "CONFLICT",
        ),
      );
    }

    const transitionResult = job.transitionTo("scene_planning");
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.getError());
    }

    await this.repository.save(job);

    const enqueueResult = await this.queueService.enqueue({
      stage: "scene_planning",
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
