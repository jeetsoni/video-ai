import type { PipelineJobDto } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";

interface GetJobStatusRequest {
  jobId: string;
}

function mapToDto(job: PipelineJob, videoUrl?: string): PipelineJobDto {
  const dto: PipelineJobDto = {
    id: job.id,
    topic: job.topic,
    format: job.format.value,
    themeId: job.themeId.value,
    status: job.status.value,
    stage: job.stage.value,
    progressPercent: job.progressPercent,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  if (job.error) {
    dto.errorCode = job.error.code;
    dto.errorMessage = job.error.message;
  }
  if (job.voiceId) {
    dto.voiceId = job.voiceId;
  }
  if (job.generatedScript) {
    dto.generatedScript = job.generatedScript;
  }
  if (job.approvedScript) {
    dto.approvedScript = job.approvedScript;
  }
  if (job.generatedScenes) {
    dto.generatedScenes = job.generatedScenes;
  }
  if (job.approvedScenes) {
    dto.approvedScenes = job.approvedScenes;
  }
  if (job.scenePlan) {
    dto.scenePlan = job.scenePlan;
  }
  if (videoUrl) {
    dto.videoUrl = videoUrl;
  }

  return dto;
}

export class GetJobStatusUseCase implements UseCase<
  GetJobStatusRequest,
  Result<PipelineJobDto, ValidationError>
> {
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly objectStore: ObjectStore,
  ) {}

  async execute(
    request: GetJobStatusRequest,
  ): Promise<Result<PipelineJobDto, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    let videoUrl: string | undefined;
    if (job.status.value === "completed" && job.videoPath) {
      const urlResult = await this.objectStore.getSignedUrl(job.videoPath);
      if (urlResult.isSuccess) {
        videoUrl = urlResult.getValue();
      }
    }

    return Result.ok(mapToDto(job, videoUrl));
  }
}
