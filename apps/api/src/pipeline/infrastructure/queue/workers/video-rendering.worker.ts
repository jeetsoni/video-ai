import type { Job } from "bullmq";
import type { ScenePlan, ProgressEvent } from "@video-ai/shared";
import type { VideoRenderer } from "@/pipeline/application/interfaces/video-renderer.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import { ANIMATION_THEMES } from "@video-ai/shared";

export class VideoRenderingWorker {
  private seq = 0;

  constructor(
    private readonly videoRenderer: VideoRenderer,
    private readonly jobRepository: PipelineJobRepository,
    private readonly eventPublisher: StreamEventPublisher,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const code = pipelineJob.generatedCode;
    if (!code) {
      pipelineJob.markFailed("rendering_failed", `Pipeline job ${jobId} has no generated code`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Pipeline job ${jobId} has no generated code`);
      throw new Error(`Pipeline job ${jobId} has no generated code`);
    }

    const audioPath = pipelineJob.audioPath;
    if (!audioPath) {
      pipelineJob.markFailed("rendering_failed", `Pipeline job ${jobId} has no audio path`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Pipeline job ${jobId} has no audio path`);
      throw new Error(`Pipeline job ${jobId} has no audio path`);
    }

    const sceneDirections = pipelineJob.sceneDirections;
    if (!sceneDirections) {
      pipelineJob.markFailed("rendering_failed", `Pipeline job ${jobId} has no scene directions`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Pipeline job ${jobId} has no scene directions`);
      throw new Error(`Pipeline job ${jobId} has no scene directions`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      pipelineJob.markFailed("rendering_failed", `Pipeline job ${jobId} has no transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Pipeline job ${jobId} has no transcript`);
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
      pipelineJob.markFailed("rendering_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      throw new Error(`Animation theme not found: ${pipelineJob.themeId.value}`);
    }

    const lastWord = transcript[transcript.length - 1];
    if (!lastWord) {
      pipelineJob.markFailed("rendering_failed", `Pipeline job ${jobId} has an empty transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", `Pipeline job ${jobId} has an empty transcript`);
      throw new Error(`Pipeline job ${jobId} has an empty transcript`);
    }

    const scenePlan: ScenePlan = {
      title: pipelineJob.topic,
      totalDuration: lastWord.end,
      fps: 30,
      totalFrames: Math.round(lastWord.end * 30),
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

    const result = await this.videoRenderer.render({
      code,
      scenePlan,
      audioPath,
      format: pipelineJob.format.value,
    });

    if (result.isFailure) {
      pipelineJob.markFailed("rendering_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", result.getError().message);
      throw result.getError();
    }

    const videoPath = result.getValue().videoPath;

    const setVideoPathResult = pipelineJob.setVideoPath(videoPath);
    if (setVideoPathResult.isFailure) {
      pipelineJob.markFailed("rendering_failed", setVideoPathResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", setVideoPathResult.getError().message);
      throw setVideoPathResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("done");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("rendering_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "rendering_failed", transitionResult.getError().message);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);
  }

  private async publishProgressEvent(
    jobId: string,
    stage: string,
    status: string,
    progressPercent: number,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    const event: ProgressEvent = {
      type: "progress",
      seq: ++this.seq,
      data: {
        stage: stage as ProgressEvent["data"]["stage"],
        status: status as ProgressEvent["data"]["status"],
        progressPercent,
        ...(errorCode && { errorCode }),
        ...(errorMessage && { errorMessage }),
      },
    };
    await this.eventPublisher.publish(`stream:progress:${jobId}`, { ...event });
  }
}
