import type { PipelineJobDto } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";

interface ListShowcaseRequest {
  page: number;
  limit: number;
  apiBaseUrl?: string;
}

interface ListShowcaseResponse {
  jobs: PipelineJobDto[];
  total: number;
  page: number;
  limit: number;
}

async function mapToDto(job: PipelineJob, apiBaseUrl?: string): Promise<PipelineJobDto> {
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

  if (job.videoPath) {
    const base = apiBaseUrl ?? "";
    dto.videoUrl = `${base}/api/pipeline/jobs/${job.id}/video`;
  }

  if (job.thumbnailPath && apiBaseUrl) {
    dto.thumbnailUrl = `${apiBaseUrl}/api/pipeline/jobs/${job.id}/thumbnail`;
  }

  return dto;
}

export class ListShowcaseUseCase
  implements UseCase<ListShowcaseRequest, Result<ListShowcaseResponse, ValidationError>>
{
  constructor(private readonly repository: PipelineJobRepository) {}

  async execute(
    request: ListShowcaseRequest,
  ): Promise<Result<ListShowcaseResponse, ValidationError>> {
    const { page, limit } = request;

    if (page < 1 || limit < 1) {
      return Result.fail(
        new ValidationError("Page and limit must be positive integers", "INVALID_INPUT"),
      );
    }

    const [jobs, total] = await Promise.all([
      this.repository.findAllCompleted(page, limit),
      this.repository.countCompleted(),
    ]);

    const dtos = await Promise.all(jobs.map((job) => mapToDto(job, request.apiBaseUrl)));

    return Result.ok({ jobs: dtos, total, page, limit });
  }
}
