import type { Job } from "bullmq";
import type { ScenePlanner } from "@/pipeline/application/interfaces/scene-planner.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

export class ScenePlanningWorker {
  constructor(
    private readonly scenePlanner: ScenePlanner,
    private readonly jobRepository: PipelineJobRepository,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const fullText = transcript.map((w) => w.word).join(" ");
    const lastWord = transcript[transcript.length - 1];
    if (!lastWord) {
      throw new Error(`Pipeline job ${jobId} has an empty transcript`);
    }
    const totalDuration = lastWord.end;

    const result = await this.scenePlanner.planScenes({
      transcript,
      fullText,
      totalDuration,
    });

    if (result.isFailure) {
      throw result.getError();
    }

    const setScenePlanResult = pipelineJob.setScenePlan(result.getValue());
    if (setScenePlanResult.isFailure) {
      pipelineJob.markFailed("scene_planning_failed", setScenePlanResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setScenePlanResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("scene_plan_review");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("scene_planning_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
  }
}
