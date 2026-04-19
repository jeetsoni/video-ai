import type {
  ScenePlan,
  VideoFormat as VideoFormatType,
} from "@video-ai/shared";
import { ANIMATION_THEMES, FORMAT_RESOLUTIONS } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";

interface GetPreviewDataRequest {
  jobId: string;
  apiBaseUrl?: string;
}

interface PreviewDataResponse {
  code: string;
  scenePlan: ScenePlan;
  audioUrl: string | null;
  audioError: boolean;
  format: VideoFormatType;
  fps: number;
  totalFrames: number;
  compositionWidth: number;
  compositionHeight: number;
}

const VALID_PREVIEW_STAGES = ["preview", "rendering", "done"] as const;

export class GetPreviewDataUseCase implements UseCase<
  GetPreviewDataRequest,
  Result<PreviewDataResponse, ValidationError>
> {
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly objectStore: ObjectStore,
  ) {}

  async execute(
    request: GetPreviewDataRequest,
  ): Promise<Result<PreviewDataResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    const stage = job.stage.value;
    if (
      !VALID_PREVIEW_STAGES.includes(
        stage as (typeof VALID_PREVIEW_STAGES)[number],
      )
    ) {
      return Result.fail(
        new ValidationError(
          `Preview data not available for stage "${stage}"`,
          "NOT_FOUND",
        ),
      );
    }

    const code = job.generatedCode;
    if (!code) {
      return Result.fail(
        new ValidationError(
          `Job "${request.jobId}" has no generated code`,
          "NOT_FOUND",
        ),
      );
    }

    const sceneDirections = job.sceneDirections;
    if (!sceneDirections) {
      return Result.fail(
        new ValidationError(
          `Job "${request.jobId}" has no scene directions`,
          "NOT_FOUND",
        ),
      );
    }

    const transcript = job.transcript;
    if (!transcript || transcript.length === 0) {
      return Result.fail(
        new ValidationError(
          `Job "${request.jobId}" has no transcript`,
          "NOT_FOUND",
        ),
      );
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === job.themeId.value);
    if (!theme) {
      return Result.fail(
        new ValidationError(
          `Animation theme not found: ${job.themeId.value}`,
          "NOT_FOUND",
        ),
      );
    }

    const lastWord = transcript[transcript.length - 1]!;
    const totalDuration = lastWord.end;
    const fps = 30;
    const totalFrames = Math.round(totalDuration * fps);

    const scenePlan: ScenePlan = {
      title: job.topic,
      totalDuration,
      fps,
      totalFrames,
      designSystem: {
        background: theme.background,
        surface: theme.surface,
        raised: theme.raised,
        textPrimary: theme.textPrimary,
        textMuted: theme.textMuted,
        accents: theme.accents,
      },
      scenes: sceneDirections,
    };

    const resolution = FORMAT_RESOLUTIONS[job.format.value];

    let audioUrl: string | null = null;
    let audioError = false;

    if (job.audioPath) {
      if (request.apiBaseUrl) {
        audioUrl = `${request.apiBaseUrl}/api/pipeline/jobs/${request.jobId}/audio`;
      } else {
        const urlResult = await this.objectStore.getSignedUrl(job.audioPath);
        if (urlResult.isSuccess) {
          audioUrl = urlResult.getValue();
        } else {
          audioError = true;
        }
      }
    } else {
      audioError = true;
    }

    return Result.ok({
      code,
      scenePlan,
      audioUrl,
      audioError,
      format: job.format.value,
      fps,
      totalFrames,
      compositionWidth: resolution.width,
      compositionHeight: resolution.height,
    });
  }
}
