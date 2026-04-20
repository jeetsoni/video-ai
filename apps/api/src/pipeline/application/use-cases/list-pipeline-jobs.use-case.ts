import type { PipelineJobDto } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";

interface ListPipelineJobsRequest {
  page: number;
  limit: number;
  browserId?: string;
}

interface ListPipelineJobsResponse {
  jobs: PipelineJobDto[];
  total: number;
  page: number;
  limit: number;
}

function mapToDto(job: PipelineJob): PipelineJobDto {
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

  return dto;
}

export class ListPipelineJobsUseCase
  implements UseCase<ListPipelineJobsRequest, Result<ListPipelineJobsResponse, ValidationError>>
{
  constructor(private readonly repository: PipelineJobRepository) {}

  async execute(
    request: ListPipelineJobsRequest,
  ): Promise<Result<ListPipelineJobsResponse, ValidationError>> {
    const { page, limit, browserId } = request;

    if (page < 1 || limit < 1) {
      return Result.fail(
        new ValidationError("Page and limit must be positive integers", "INVALID_INPUT"),
      );
    }

    const [jobs, total] = await Promise.all([
      this.repository.findAll(page, limit, browserId),
      this.repository.count(browserId),
    ]);

    return Result.ok({
      jobs: jobs.map(mapToDto),
      total,
      page,
      limit,
    });
  }
}
