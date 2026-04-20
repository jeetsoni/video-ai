import type { Job } from "bullmq";
import type { ProgressEvent } from "@video-ai/shared";
import type { TimestampMapper } from "@/pipeline/application/interfaces/timestamp-mapper.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";

export class TimestampMappingWorker {
  private seq = 0;

  constructor(
    private readonly timestampMapper: TimestampMapper,
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

    const approvedScenes = pipelineJob.approvedScenes;
    if (!approvedScenes) {
      pipelineJob.markFailed("timestamp_mapping_failed", `Pipeline job ${jobId} has no approved scenes`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "timestamp_mapping_failed", `Pipeline job ${jobId} has no approved scenes`);
      throw new Error(`Pipeline job ${jobId} has no approved scenes`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      pipelineJob.markFailed("timestamp_mapping_failed", `Pipeline job ${jobId} has no transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "timestamp_mapping_failed", `Pipeline job ${jobId} has no transcript`);
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const result = this.timestampMapper.mapTimestamps({ scenes: approvedScenes, transcript });

    if (result.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "timestamp_mapping_failed", result.getError().message);
      throw result.getError();
    }

    const setScenePlanResult = pipelineJob.setScenePlan(result.getValue());
    if (setScenePlanResult.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", setScenePlanResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "timestamp_mapping_failed", setScenePlanResult.getError().message);
      throw setScenePlanResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("direction_generation");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("timestamp_mapping_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "timestamp_mapping_failed", transitionResult.getError().message);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);

    await this.queueService.enqueue({ stage: "direction_generation", jobId });
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
