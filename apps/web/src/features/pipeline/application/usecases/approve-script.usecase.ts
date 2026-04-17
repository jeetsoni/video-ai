import type { PipelineRepository } from "../../interfaces/pipeline-repository";
import type { ActionResponse } from "../../types/pipeline.types";

export interface ApproveScriptInput {
  jobId: string;
  script?: string;
}

export class ApproveScriptUseCase {
  constructor(private readonly repo: PipelineRepository) {}

  execute(input: ApproveScriptInput): Promise<ActionResponse> {
    return this.repo.approveScript(input);
  }
}
