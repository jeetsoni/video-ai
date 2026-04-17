import type { VideoFormat, PipelineJobDto } from "@video-ai/shared";
import type {
  CreateJobResponse,
  ListJobsResponse,
  ListThemesResponse,
  ActionResponse,
} from "../types/pipeline.types";

export interface CreateJobParams {
  topic: string;
  format: VideoFormat;
  themeId: string;
}

export interface ApproveScriptParams {
  jobId: string;
  script?: string;
}

export interface PipelineRepository {
  createJob(params: CreateJobParams): Promise<CreateJobResponse>;
  getJobStatus(jobId: string): Promise<PipelineJobDto>;
  approveScript(params: ApproveScriptParams): Promise<ActionResponse>;
  approveScenePlan(jobId: string): Promise<ActionResponse>;
  regenerateScript(jobId: string): Promise<ActionResponse>;
  regenerateScenePlan(jobId: string): Promise<ActionResponse>;
  listJobs(page: number, limit: number): Promise<ListJobsResponse>;
  getThemes(): Promise<ListThemesResponse>;
}
