import type { Job } from "bullmq";
import type { DirectionGenerator } from "@/pipeline/application/interfaces/direction-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { SceneDirection } from "@video-ai/shared";
import { ANIMATION_THEMES, getLayoutProfile } from "@video-ai/shared";

export class DirectionGenerationWorker {
  constructor(
    private readonly directionGenerator: DirectionGenerator,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const scenePlan = pipelineJob.scenePlan;
    if (!scenePlan) {
      throw new Error(`Pipeline job ${jobId} has no scene plan`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
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
      throw setDirectionsResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("code_generation");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("direction_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);

    await this.queueService.enqueue({ stage: "code_generation", jobId });
  }
}
