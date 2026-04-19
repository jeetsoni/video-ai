import type {
  VideoFormat,
  PipelineJobDto,
  SceneBoundary,
  ListVoicesResponse,
  VoiceSettings,
} from "@video-ai/shared";
import type {
  CreateJobResponse,
  ListJobsResponse,
  ListThemesResponse,
  ActionResponse,
  PreviewDataResponse,
} from "../types/pipeline.types";

export interface CreateJobParams {
  topic: string;
  format: VideoFormat;
  themeId: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings;
}

export interface ApproveScriptParams {
  jobId: string;
  script?: string;
  scenes?: SceneBoundary[];
}

export interface PipelineRepository {
  createJob(params: CreateJobParams): Promise<CreateJobResponse>;
  getJobStatus(jobId: string): Promise<PipelineJobDto>;
  approveScript(params: ApproveScriptParams): Promise<ActionResponse>;
  regenerateScript(jobId: string): Promise<ActionResponse>;
  regenerateCode(jobId: string): Promise<ActionResponse>;
  listJobs(page: number, limit: number): Promise<ListJobsResponse>;
  getThemes(): Promise<ListThemesResponse>;
  getPreviewData(jobId: string): Promise<PreviewDataResponse>;
  exportVideo(jobId: string): Promise<ActionResponse>;
  listVoices(): Promise<ListVoicesResponse>;
}
