import { createPipelineJobSchema } from "@video-ai/shared";
import type { VoiceSettings } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { IdGenerator } from "@/shared/domain/interfaces/id-generator.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";

interface CreatePipelineJobRequest {
  topic: string;
  format: string;
  themeId: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings;
}

interface CreatePipelineJobResponse {
  id: string;
  status: string;
}

export class CreatePipelineJobUseCase implements UseCase<
  CreatePipelineJobRequest,
  Result<CreatePipelineJobResponse, ValidationError>
> {
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly queueService: QueueService,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    request: CreatePipelineJobRequest,
  ): Promise<Result<CreatePipelineJobResponse, ValidationError>> {
    const parsed = createPipelineJobSchema.safeParse(request);
    if (!parsed.success) {
      const firstIssue = parsed.error?.issues[0]?.message ?? "Invalid input";
      return Result.fail(new ValidationError(firstIssue, "INVALID_INPUT"));
    }

    const { topic, format, themeId, voiceId } = parsed.data;

    const formatResult = VideoFormat.create(format);
    if (formatResult.isFailure) {
      return Result.fail(formatResult.getError());
    }

    const themeIdResult = AnimationThemeId.create(themeId);
    if (themeIdResult.isFailure) {
      return Result.fail(themeIdResult.getError());
    }

    const job = PipelineJob.create({
      id: this.idGenerator.generate(),
      topic,
      format: formatResult.getValue(),
      themeId: themeIdResult.getValue(),
      voiceId,
      voiceSettings: parsed.data.voiceSettings ?? null,
    });

    await this.repository.save(job);

    const enqueueResult = await this.queueService.enqueue({
      stage: "script_generation",
      jobId: job.id,
    });

    if (enqueueResult.isFailure) {
      return Result.fail(
        new ValidationError(enqueueResult.getError().message, "QUEUE_ERROR"),
      );
    }

    return Result.ok({ id: job.id, status: job.status.value });
  }
}
