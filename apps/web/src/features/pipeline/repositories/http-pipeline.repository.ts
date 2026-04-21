import type {
  PipelineJobDto,
  ListVoicesResponse,
  VoiceSettings,
  TweakMessageDto,
} from "@video-ai/shared";
import type { HttpClient } from "@/shared/interfaces/http-client";
import type { ConfigClient } from "@/shared/interfaces/config-client";
import { getBrowserId } from "@/shared/lib/browser-id";
import type {
  PipelineRepository,
  CreateJobParams,
  ApproveScriptParams,
  AutofixCodeParams,
  AutofixCodeResponse,
} from "../interfaces/pipeline-repository";
import type {
  CreateJobResponse,
  ListJobsResponse,
  ListThemesResponse,
  ActionResponse,
  PreviewDataResponse,
  SendTweakParams,
  SendTweakResponse,
} from "../types/pipeline.types";

const BASE = "/api/pipeline";

export class HttpPipelineRepository implements PipelineRepository {
  constructor(
    private readonly http: HttpClient,
    private readonly configService?: ConfigClient,
  ) {}

  createJob(params: CreateJobParams): Promise<CreateJobResponse> {
    return this.http.post<CreateJobResponse>({
      path: `${BASE}/jobs`,
      body: params,
    });
  }

  getJobStatus(jobId: string): Promise<PipelineJobDto> {
    return this.http.get<PipelineJobDto>({
      path: `${BASE}/jobs/${jobId}`,
    });
  }

  approveScript(params: ApproveScriptParams): Promise<ActionResponse> {
    return this.http.post<ActionResponse>({
      path: `${BASE}/jobs/${params.jobId}/approve-script`,
      body: {
        action: "approve" as const,
        script: params.script,
        ...(params.scenes && { scenes: params.scenes }),
        ...(params.voiceId && { voiceId: params.voiceId }),
        ...(params.voiceSettings && { voiceSettings: params.voiceSettings }),
      },
    });
  }

  regenerateScript(jobId: string): Promise<ActionResponse> {
    return this.http.post<ActionResponse>({
      path: `${BASE}/jobs/${jobId}/regenerate-script`,
      body: {},
    });
  }

  regenerateCode(jobId: string): Promise<ActionResponse> {
    return this.http.post<ActionResponse>({
      path: `${BASE}/jobs/${jobId}/regenerate-code`,
      body: {},
    });
  }

  autofixCode(params: AutofixCodeParams): Promise<AutofixCodeResponse> {
    return this.http.post<AutofixCodeResponse>({
      path: `${BASE}/jobs/${params.jobId}/autofix-code`,
      body: {
        errorMessage: params.errorMessage,
        errorType: params.errorType,
        sceneIndex: params.sceneIndex,
      },
    });
  }

  retryJob(jobId: string): Promise<ActionResponse> {
    return this.http.post<ActionResponse>({
      path: `${BASE}/jobs/${jobId}/retry`,
      body: {},
    });
  }

  listJobs(page: number, limit: number): Promise<ListJobsResponse> {
    return this.http.get<ListJobsResponse>({
      path: `${BASE}/jobs`,
      queryParams: { page: String(page), limit: String(limit) },
    });
  }

  listShowcase(page: number, limit: number): Promise<ListJobsResponse> {
    return this.http.get<ListJobsResponse>({
      path: `${BASE}/showcase`,
      queryParams: { page: String(page), limit: String(limit) },
    });
  }

  getThemes(): Promise<ListThemesResponse> {
    return this.http.get<ListThemesResponse>({
      path: `${BASE}/themes`,
    });
  }

  getPreviewData(jobId: string): Promise<PreviewDataResponse> {
    return this.http.get<PreviewDataResponse>({
      path: `${BASE}/jobs/${jobId}/preview`,
    });
  }

  exportVideo(jobId: string): Promise<ActionResponse> {
    return this.http.post<ActionResponse>({
      path: `${BASE}/jobs/${jobId}/export`,
      body: {},
    });
  }

  listVoices(): Promise<ListVoicesResponse> {
    return this.http.get<ListVoicesResponse>({
      path: `${BASE}/voices`,
    });
  }

  async previewVoice(params: {
    voiceId?: string;
    voiceSettings: VoiceSettings;
    text?: string;
  }): Promise<Blob> {
    const apiBase = this.configService?.getApiBaseUrl() ?? "";
    const response = await fetch(`${apiBase}${BASE}/voice-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Id": getBrowserId(),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.message ?? `Preview request failed (${response.status})`,
      );
    }

    return response.blob();
  }

  sendTweak(params: SendTweakParams): Promise<SendTweakResponse> {
    return this.http.post<SendTweakResponse>({
      path: `${BASE}/jobs/${params.jobId}/tweak`,
      body: {
        message: params.message,
        screenshot: params.screenshot,
        frame: params.frame,
        timeSeconds: params.timeSeconds,
      },
    });
  }

  async getTweakMessages(jobId: string): Promise<TweakMessageDto[]> {
    const response = await this.http.get<{ messages: TweakMessageDto[] }>({
      path: `${BASE}/jobs/${jobId}/tweak/messages`,
    });
    return response.messages;
  }
}
