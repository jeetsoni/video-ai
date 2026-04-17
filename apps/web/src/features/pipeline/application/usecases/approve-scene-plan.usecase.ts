import type { PipelineRepository } from "../../interfaces/pipeline-repository";
import type { ActionResponse } from "../../types/pipeline.types";

export class ApproveScenePlanUseCase {
  constructor(private readonly repo: PipelineRepository) {}

  execute(jobId: string): Promise<ActionResponse> {
    return this.repo.approveScenePlan(jobId);
  }
}
