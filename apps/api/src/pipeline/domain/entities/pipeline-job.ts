import type {
  PipelineStage as PipelineStageType,
  PipelineErrorCode,
  WordTimestamp,
  SceneBoundary,
  SceneDirection,
} from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { JobError } from "@/pipeline/domain/value-objects/job-error.js";

const STAGE_TO_STATUS: Record<PipelineStageType, PipelineStatus> = {
  script_generation: PipelineStatus.processing(),
  script_review: PipelineStatus.awaitingScriptReview(),
  tts_generation: PipelineStatus.processing(),
  transcription: PipelineStatus.processing(),
  timestamp_mapping: PipelineStatus.processing(),
  direction_generation: PipelineStatus.processing(),
  code_generation: PipelineStatus.processing(),
  preview: PipelineStatus.completed(),
  rendering: PipelineStatus.processing(),
  done: PipelineStatus.completed(),
};

const STAGE_TO_PROGRESS: Record<PipelineStageType, number> = {
  script_generation: 10,
  script_review: 15,
  tts_generation: 30,
  transcription: 45,
  timestamp_mapping: 55,
  direction_generation: 65,
  code_generation: 80,
  preview: 95,
  rendering: 90,
  done: 100,
};

interface PipelineJobProps {
  id: string;
  topic: string;
  format: VideoFormat;
  themeId: AnimationThemeId;
  voiceId: string | null;
  status: PipelineStatus;
  stage: PipelineStage;
  error: JobError | null;
  generatedScript: string | null;
  approvedScript: string | null;
  generatedScenes: SceneBoundary[] | null;
  approvedScenes: SceneBoundary[] | null;
  audioPath: string | null;
  transcript: WordTimestamp[] | null;
  scenePlan: SceneBoundary[] | null;
  sceneDirections: SceneDirection[] | null;
  generatedCode: string | null;
  codePath: string | null;
  videoPath: string | null;
  progressPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PipelineJob {
  private constructor(private props: PipelineJobProps) {}

  get id(): string {
    return this.props.id;
  }
  get topic(): string {
    return this.props.topic;
  }
  get format(): VideoFormat {
    return this.props.format;
  }
  get themeId(): AnimationThemeId {
    return this.props.themeId;
  }
  get voiceId(): string | null {
    return this.props.voiceId;
  }
  get status(): PipelineStatus {
    return this.props.status;
  }
  get stage(): PipelineStage {
    return this.props.stage;
  }
  get error(): JobError | null {
    return this.props.error;
  }
  get generatedScript(): string | null {
    return this.props.generatedScript;
  }
  get approvedScript(): string | null {
    return this.props.approvedScript;
  }
  get generatedScenes(): SceneBoundary[] | null {
    return this.props.generatedScenes;
  }
  get approvedScenes(): SceneBoundary[] | null {
    return this.props.approvedScenes;
  }
  get audioPath(): string | null {
    return this.props.audioPath;
  }
  get transcript(): WordTimestamp[] | null {
    return this.props.transcript;
  }
  get scenePlan(): SceneBoundary[] | null {
    return this.props.scenePlan;
  }
  get sceneDirections(): SceneDirection[] | null {
    return this.props.sceneDirections;
  }
  get generatedCode(): string | null {
    return this.props.generatedCode;
  }
  get codePath(): string | null {
    return this.props.codePath;
  }
  get videoPath(): string | null {
    return this.props.videoPath;
  }
  get progressPercent(): number {
    return this.props.progressPercent;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(params: {
    id: string;
    topic: string;
    format: VideoFormat;
    themeId: AnimationThemeId;
    voiceId?: string | null;
  }): PipelineJob {
    const now = new Date();
    return new PipelineJob({
      id: params.id,
      topic: params.topic,
      format: params.format,
      themeId: params.themeId,
      voiceId: params.voiceId ?? null,
      status: PipelineStatus.pending(),
      stage: PipelineStage.initial(),
      error: null,
      generatedScript: null,
      approvedScript: null,
      generatedScenes: null,
      approvedScenes: null,
      audioPath: null,
      transcript: null,
      scenePlan: null,
      sceneDirections: null,
      generatedCode: null,
      codePath: null,
      videoPath: null,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(params: {
    id: string;
    topic: string;
    format: VideoFormat;
    themeId: AnimationThemeId;
    voiceId: string | null;
    status: PipelineStatus;
    stage: PipelineStage;
    error: JobError | null;
    generatedScript: string | null;
    approvedScript: string | null;
    generatedScenes: SceneBoundary[] | null;
    approvedScenes: SceneBoundary[] | null;
    audioPath: string | null;
    transcript: WordTimestamp[] | null;
    scenePlan: SceneBoundary[] | null;
    sceneDirections: SceneDirection[] | null;
    generatedCode: string | null;
    codePath: string | null;
    videoPath: string | null;
    progressPercent: number;
    createdAt: Date;
    updatedAt: Date;
  }): PipelineJob {
    return new PipelineJob({ ...params });
  }

  transitionTo(
    targetStageValue: PipelineStageType,
  ): Result<void, ValidationError> {
    const isPreviewStage = this.props.stage.value === "preview";
    if (this.props.status.isTerminal() && !isPreviewStage) {
      return Result.fail(
        new ValidationError(
          `Cannot transition from terminal status "${this.props.status.value}"`,
          "INVALID_TRANSITION",
        ),
      );
    }

    const targetStage = PipelineStage.create(targetStageValue);
    if (!targetStage) {
      return Result.fail(
        new ValidationError(
          `Invalid pipeline stage "${targetStageValue}"`,
          "INVALID_STAGE",
        ),
      );
    }

    if (!this.props.stage.canTransitionTo(targetStage)) {
      return Result.fail(
        new ValidationError(
          `Cannot transition from "${this.props.stage.value}" to "${targetStageValue}"`,
          "INVALID_TRANSITION",
        ),
      );
    }

    this.props.stage = targetStage;
    this.props.status = STAGE_TO_STATUS[targetStageValue];
    this.props.progressPercent = STAGE_TO_PROGRESS[targetStageValue];
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  markFailed(
    errorCode: PipelineErrorCode,
    errorMessage: string,
  ): Result<void, ValidationError> {
    const errorResult = JobError.create(errorCode, errorMessage);
    if (errorResult.isFailure) {
      return Result.fail(errorResult.getError());
    }

    this.props.status = PipelineStatus.failed();
    this.props.error = errorResult.getValue();
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  setScript(
    script: string,
    scenes: SceneBoundary[],
  ): Result<void, ValidationError> {
    if (this.props.stage.value !== "script_generation") {
      return Result.fail(
        new ValidationError(
          `Cannot set script in stage "${this.props.stage.value}", expected "script_generation"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.generatedScript = script;
    this.props.generatedScenes = scenes;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setApprovedScript(
    script: string,
    scenes: SceneBoundary[],
  ): Result<void, ValidationError> {
    if (this.props.stage.value !== "script_review") {
      return Result.fail(
        new ValidationError(
          `Cannot set approved script in stage "${this.props.stage.value}", expected "script_review"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.approvedScript = script;
    this.props.approvedScenes = scenes;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setAudioPath(audioPath: string): Result<void, ValidationError> {
    if (this.props.stage.value !== "tts_generation") {
      return Result.fail(
        new ValidationError(
          `Cannot set audio path in stage "${this.props.stage.value}", expected "tts_generation"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.audioPath = audioPath;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setTranscript(transcript: WordTimestamp[]): Result<void, ValidationError> {
    if (this.props.stage.value !== "transcription") {
      return Result.fail(
        new ValidationError(
          `Cannot set transcript in stage "${this.props.stage.value}", expected "transcription"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.transcript = transcript;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setScenePlan(scenePlan: SceneBoundary[]): Result<void, ValidationError> {
    if (this.props.stage.value !== "timestamp_mapping") {
      return Result.fail(
        new ValidationError(
          `Cannot set scene plan in stage "${this.props.stage.value}", expected "timestamp_mapping"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.scenePlan = scenePlan;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setSceneDirections(
    directions: SceneDirection[],
  ): Result<void, ValidationError> {
    if (this.props.stage.value !== "direction_generation") {
      return Result.fail(
        new ValidationError(
          `Cannot set scene directions in stage "${this.props.stage.value}", expected "direction_generation"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.sceneDirections = directions;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setGeneratedCode(
    code: string,
    codePath?: string,
  ): Result<void, ValidationError> {
    if (this.props.stage.value !== "code_generation") {
      return Result.fail(
        new ValidationError(
          `Cannot set generated code in stage "${this.props.stage.value}", expected "code_generation"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.generatedCode = code;
    if (codePath) {
      this.props.codePath = codePath;
    }
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }

  setVideoPath(videoPath: string): Result<void, ValidationError> {
    if (this.props.stage.value !== "rendering") {
      return Result.fail(
        new ValidationError(
          `Cannot set video path in stage "${this.props.stage.value}", expected "rendering"`,
          "INVALID_STAGE_FOR_ARTIFACT",
        ),
      );
    }
    this.props.videoPath = videoPath;
    this.props.updatedAt = new Date();
    return Result.ok(undefined);
  }
}
