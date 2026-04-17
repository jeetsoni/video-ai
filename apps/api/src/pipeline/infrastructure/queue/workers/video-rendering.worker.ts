import type { Job } from "bullmq";
import type { ScenePlan } from "@video-ai/shared";
import type { VideoRenderer } from "@/pipeline/application/interfaces/video-renderer.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import { ANIMATION_THEMES } from "@video-ai/shared";

export class VideoRenderingWorker {
  constructor(
    private readonly videoRenderer: VideoRenderer,
    private readonly jobRepository: PipelineJobRepository,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const code = pipelineJob.generatedCode;
    if (!code) {
      throw new Error(`Pipeline job ${jobId} has no generated code`);
    }

    const audioPath = pipelineJob.audioPath;
    if (!audioPath) {
      throw new Error(`Pipeline job ${jobId} has no audio path`);
    }

    const sceneDirections = pipelineJob.sceneDirections;
    if (!sceneDirections) {
      throw new Error(`Pipeline job ${jobId} has no scene directions`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
      throw new Error(`Animation theme not found: ${pipelineJob.themeId.value}`);
    }

    const lastWord = transcript[transcript.length - 1];
    if (!lastWord) {
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
      throw result.getError();
    }

    const videoPath = result.getValue().videoPath;

    const setVideoPathResult = pipelineJob.setVideoPath(videoPath);
    if (setVideoPathResult.isFailure) {
      pipelineJob.markFailed("rendering_failed", setVideoPathResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setVideoPathResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("done");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("rendering_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
  }
}
