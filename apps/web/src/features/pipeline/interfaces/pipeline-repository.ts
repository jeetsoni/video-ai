import type {
  VideoFormat,
  PipelineJobDto,
  SceneBoundary,
  ListVoicesResponse,
  VoiceSettings,
  TweakMessageDto,
} from "@video-ai/shared";
import type {
  CreateJobResponse,
  ListJobsResponse,
  ListThemesResponse,
  ActionResponse,
  PreviewDataResponse,
  SendTweakParams,
  SendTweakResponse,
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
  voiceId?: string;
  voiceSettings?: VoiceSettings;
}

export interface AutofixCodeParams {
  jobId: string;
  errorMessage: string;
  errorType: string;
  sceneIndex?: number;
}

export interface AutofixCodeResponse {
  status: "ok";
  fixedCode: string;
  explanation: string;
}

export interface PipelineRepository {
  createJob(params: CreateJobParams): Promise<CreateJobResponse>;
  getJobStatus(jobId: string): Promise<PipelineJobDto>;
  approveScript(params: ApproveScriptParams): Promise<ActionResponse>;
  regenerateScript(jobId: string): Promise<ActionResponse>;
  regenerateCode(jobId: string): Promise<ActionResponse>;
  autofixCode(params: AutofixCodeParams): Promise<AutofixCodeResponse>;
  retryJob(jobId: string): Promise<ActionResponse>;
  listJobs(page: number, limit: number): Promise<ListJobsResponse>;
  getThemes(): Promise<ListThemesResponse>;
  getPreviewData(jobId: string): Promise<PreviewDataResponse>;
  exportVideo(jobId: string): Promise<ActionResponse>;
  listVoices(): Promise<ListVoicesResponse>;
  previewVoice(params: {
    voiceId?: string;
    voiceSettings: VoiceSettings;
    text?: string;
  }): Promise<Blob>;
  sendTweak(params: SendTweakParams): Promise<SendTweakResponse>;
  getTweakMessages(jobId: string): Promise<TweakMessageDto[]>;
}
