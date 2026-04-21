import type { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";

export interface PipelineJobRepository {
  save(job: PipelineJob): Promise<void>;
  findById(id: string): Promise<PipelineJob | null>;
  findAll(page: number, limit: number, browserId?: string): Promise<PipelineJob[]>;
  count(browserId?: string): Promise<number>;
  findAllCompleted(page: number, limit: number): Promise<PipelineJob[]>;
  countCompleted(): Promise<number>;
}
