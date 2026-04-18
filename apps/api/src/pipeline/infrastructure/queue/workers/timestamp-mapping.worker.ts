import type { Job } from "bullmq";
import type { TimestampMapper } from "@/pipeline/application/interfaces/timestamp-mapper.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

export class TimestampMappingWorker {
  constructor(
    private readonly timestampMapper: TimestampMapper,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const approvedScenes = pipelineJob.approvedScenes;
    if (!approvedScenes) {
      throw new Error(`Pipeline job ${jobId} has no approved scenes`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const result = this.timestampMapper.mapTimestamps({ scenes: approvedScenes, transcript });

    if (result.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw result.getError();
    }

    const setScenePlanResult = pipelineJob.setScenePlan(result.getValue());
    if (setScenePlanResult.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", setScenePlanResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setScenePlanResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("direction_generation");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);

    await this.queueService.enqueue({ stage: "direction_generation", jobId });
  }
}
