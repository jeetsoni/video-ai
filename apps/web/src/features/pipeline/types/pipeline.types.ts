import type { VideoFormat, ScenePlan, PipelineJobDto } from "@video-ai/shared";

export type {
  VideoFormat,
  PipelineStatus,
  PipelineStage,
  PipelineErrorCode,
  WordTimestamp,
  SceneBoundary,
  SceneBeat,
  SceneDirection,
  AnimationTheme,
  ScenePlan,
  PipelineJobDto,
} from "@video-ai/shared";

export { FORMAT_WORD_RANGES, FORMAT_RESOLUTIONS } from "@video-ai/shared";

/** Response shape from POST /api/pipeline/jobs */
export interface CreateJobResponse {
  jobId: string;
  status: string;
}

/** Response shape from GET /api/pipeline/jobs */
export interface ListJobsResponse {
  jobs: PipelineJobDto[];
  total: number;
  page: number;
  limit: number;
}

/** Response shape from GET /api/pipeline/themes */
export interface ThemeDto {
  id: string;
  name: string;
  description: string;
  palette: unknown;
  isDefault: boolean;
  sortOrder: number;
}

export interface ListThemesResponse {
  themes: ThemeDto[];
}

/** Generic action response for approve/regenerate endpoints */
export interface ActionResponse {
  status: "ok";
}

/** Response shape from GET /api/pipeline/jobs/:id/preview */
export interface PreviewDataResponse {
  code: string;
  scenePlan: ScenePlan;
  audioUrl: string | null;
  audioError: boolean;
  format: VideoFormat;
  fps: number;
  totalFrames: number;
  compositionWidth: number;
  compositionHeight: number;
}
