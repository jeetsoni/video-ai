import type { PipelineJob as PrismaPipelineJob } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  WordTimestamp,
  SceneBoundary,
  SceneDirection,
} from "@video-ai/shared";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { JobError } from "@/pipeline/domain/value-objects/job-error.js";

export class PipelineJobMapper {
  static toDomain(record: PrismaPipelineJob): PipelineJob {
    const format = VideoFormat.create(record.format).getValue();
    const themeId = AnimationThemeId.create(record.themeId).getValue();
    const status = PipelineStatus.create(record.status)!;
    const stage = PipelineStage.create(record.stage)!;

    let error: JobError | null = null;
    if (record.errorCode && record.errorMessage) {
      error = JobError.create(record.errorCode, record.errorMessage).getValue();
    }

    return PipelineJob.reconstitute({
      id: record.id,
      topic: record.topic,
      format,
      themeId,
      status,
      stage,
      error,
      generatedScript: record.generatedScript,
      approvedScript: record.approvedScript,
      audioPath: record.audioPath,
      transcript: record.transcript as unknown as WordTimestamp[] | null,
      scenePlan: record.scenePlan as unknown as SceneBoundary[] | null,
      sceneDirections: record.sceneDirections as unknown as SceneDirection[] | null,
      generatedCode: record.generatedCode,
      codePath: record.codePath,
      videoPath: record.videoPath,
      progressPercent: record.progressPercent,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  static toPersistence(job: PipelineJob): Omit<PrismaPipelineJob, "createdAt" | "updatedAt"> & {
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: job.id,
      topic: job.topic,
      format: job.format.value as PrismaPipelineJob["format"],
      themeId: job.themeId.value,
      status: job.status.value as PrismaPipelineJob["status"],
      stage: job.stage.value as PrismaPipelineJob["stage"],
      errorCode: job.error?.code ?? null,
      errorMessage: job.error?.message ?? null,
      generatedScript: job.generatedScript,
      approvedScript: job.approvedScript,
      audioPath: job.audioPath,
      transcript: job.transcript !== null ? (job.transcript as unknown as Prisma.JsonValue) : null,
      scenePlan: job.scenePlan !== null ? (job.scenePlan as unknown as Prisma.JsonValue) : null,
      sceneDirections: job.sceneDirections !== null ? (job.sceneDirections as unknown as Prisma.JsonValue) : null,
      generatedCode: job.generatedCode,
      codePath: job.codePath,
      videoPath: job.videoPath,
      progressPercent: job.progressPercent,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
