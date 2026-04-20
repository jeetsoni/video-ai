import type { Job } from "bullmq";
import type { ProgressEvent } from "@video-ai/shared";
import type { DirectionGenerator } from "@/pipeline/application/interfaces/direction-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { SceneDirection } from "@video-ai/shared";
import { ANIMATION_THEMES, getLayoutProfile } from "@video-ai/shared";

export class DirectionGenerationWorker {
  private seq = 0;

  constructor(
    private readonly directionGenerator: DirectionGenerator,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
    private readonly eventPublisher: StreamEventPublisher,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const scenePlan = pipelineJob.scenePlan;
    if (!scenePlan) {
      pipelineJob.markFailed("direction_generation_failed", `Pipeline job ${jobId} has no scene plan`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", `Pipeline job ${jobId} has no scene plan`);
      throw new Error(`Pipeline job ${jobId} has no scene plan`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      pipelineJob.markFailed("direction_generation_failed", `Pipeline job ${jobId} has no transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", `Pipeline job ${jobId} has no transcript`);
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
      pipelineJob.markFailed("direction_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      throw new Error(`Animation theme not found: ${pipelineJob.themeId.value}`);
    }

    const layoutProfile = getLayoutProfile("faceless");

    const directions: SceneDirection[] = [];
    let previousDirection: SceneDirection | undefined;

    for (const scene of scenePlan) {
      const words = transcript.filter(
        (w) => w.start >= scene.startTime && w.end <= scene.endTime,
      );

      const result = await this.directionGenerator.generateDirection({
        scene,
        words,
        theme,
        layoutProfile,
        previousDirection,
      });

      if (result.isFailure) {
        pipelineJob.markFailed("direction_generation_failed", result.getError().message);
        await this.jobRepository.save(pipelineJob);
        await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", result.getError().message);
        throw result.getError();
      }

      const direction = result.getValue();
      directions.push(direction);
      previousDirection = direction;
    }

    const setDirectionsResult = pipelineJob.setSceneDirections(directions);
    if (setDirectionsResult.isFailure) {
      pipelineJob.markFailed("direction_generation_failed", setDirectionsResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", setDirectionsResult.getError().message);
      throw setDirectionsResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("code_generation");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("direction_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "direction_generation_failed", transitionResult.getError().message);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);

    await this.queueService.enqueue({ stage: "code_generation", jobId });
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
