import type { PipelineJobDto } from "@video-ai/shared";
import type { PipelineRepository } from "../../interfaces/pipeline-repository";

export class GetJobStatusUseCase {
  constructor(private readonly repo: PipelineRepository) {}

  execute(jobId: string): Promise<PipelineJobDto> {
    return this.repo.getJobStatus(jobId);
  }
}
