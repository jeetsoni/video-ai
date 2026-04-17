import type { PipelineRepository } from "../../interfaces/pipeline-repository";
import type { ListJobsResponse } from "../../types/pipeline.types";

export interface ListPipelineJobsInput {
  page: number;
  limit: number;
}

export class ListPipelineJobsUseCase {
  constructor(private readonly repo: PipelineRepository) {}

  execute(input: ListPipelineJobsInput): Promise<ListJobsResponse> {
    return this.repo.listJobs(input.page, input.limit);
  }
}
