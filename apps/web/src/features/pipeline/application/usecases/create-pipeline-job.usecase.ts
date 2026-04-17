import type { VideoFormat } from "@video-ai/shared";
import type { PipelineRepository } from "../../interfaces/pipeline-repository";
import type { CreateJobResponse } from "../../types/pipeline.types";

export interface CreatePipelineJobInput {
  topic: string;
  format: VideoFormat;
  themeId: string;
}

export class CreatePipelineJobUseCase {
  constructor(private readonly repo: PipelineRepository) {}

  execute(input: CreatePipelineJobInput): Promise<CreateJobResponse> {
    return this.repo.createJob(input);
  }
}
