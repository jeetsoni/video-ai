import type { PipelineJobDto, ListVoicesResponse } from "@video-ai/shared";
import type { HttpClient } from "@/shared/interfaces/http-client";
import type {
  PipelineRepository,
  CreateJobParams,
  ApproveScriptParams,
} from "../interfaces/pipeline-repository";
import type {
  CreateJobResponse,
  ListJobsResponse,
  ListThemesResponse,
  ActionResponse,
  PreviewDataResponse,
} from "../types/pipeline.types";

const BASE = "/api/pipeline";

export class HttpPipelineRepository implements PipelineRepository {
  constructor(private readonly http: HttpClient) {}

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

  listJobs(page: number, limit: number): Promise<ListJobsResponse> {
    return this.http.get<ListJobsResponse>({
      path: `${BASE}/jobs`,
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
}
