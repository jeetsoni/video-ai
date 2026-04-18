import { FORMAT_WORD_RANGES } from "@video-ai/shared";
import type { SceneBoundary } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

interface ApproveScriptRequest {
  jobId: string;
  editedScript?: string;
  scenes?: SceneBoundary[];
}

export class ApproveScriptUseCase
  implements UseCase<ApproveScriptRequest, Result<void, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(
    request: ApproveScriptRequest,
  ): Promise<Result<void, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    if (job.status.value !== "awaiting_script_review") {
      return Result.fail(
        new ValidationError(
          `Job is in "${job.status.value}" status, expected "awaiting_script_review"`,
          "CONFLICT",
        ),
      );
    }

    const scriptToApprove = request.editedScript ?? job.generatedScript;
    if (!scriptToApprove) {
      return Result.fail(
        new ValidationError("No script available to approve", "INVALID_INPUT"),
      );
    }

    if (request.editedScript) {
      const wordCount = request.editedScript.trim().split(/\s+/).length;
      if (wordCount < 10) {
        return Result.fail(
          new ValidationError(
            `Script must have at least 10 words, got ${wordCount}`,
            "INVALID_WORD_COUNT",
          ),
        );
      }

      const range = FORMAT_WORD_RANGES[job.format.value];
      if (wordCount < range.min || wordCount > range.max) {
        return Result.fail(
          new ValidationError(
            `Script word count (${wordCount}) is outside the allowed range for "${job.format.value}" format (${range.min}–${range.max})`,
            "INVALID_WORD_COUNT",
          ),
        );
      }
    }

    const scenesToApprove = request.scenes ?? job.generatedScenes ?? [];

    const setResult = job.setApprovedScript(scriptToApprove, scenesToApprove);
    if (setResult.isFailure) {
      return Result.fail(setResult.getError());
    }

    const transitionResult = job.transitionTo("tts_generation");
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.getError());
    }

    await this.repository.save(job);

    const enqueueResult = await this.queueService.enqueue({
      stage: "tts_generation",
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
