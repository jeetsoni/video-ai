import type { Job } from "bullmq";
import type { ProgressEvent } from "@video-ai/shared";
import type { TranscriptionService } from "@/pipeline/application/interfaces/transcription-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";

export class TranscriptionWorker {
  private seq = 0;

  constructor(
    private readonly transcriptionService: TranscriptionService,
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

    const audioPath = pipelineJob.audioPath;
    if (!audioPath) {
      pipelineJob.markFailed("transcription_failed", `Pipeline job ${jobId} has no audio path`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", `Pipeline job ${jobId} has no audio path`);
      throw new Error(`Pipeline job ${jobId} has no audio path`);
    }

    const scriptText = pipelineJob.approvedScript ?? pipelineJob.generatedScript;
    if (!scriptText) {
      pipelineJob.markFailed("transcription_failed", `Pipeline job ${jobId} has no script text`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", `Pipeline job ${jobId} has no script text`);
      throw new Error(`Pipeline job ${jobId} has no script text`);
    }

    const result = await this.transcriptionService.transcribe({ audioPath, scriptText });

    if (result.isFailure) {
      pipelineJob.markFailed("transcription_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", result.getError().message);
      throw result.getError();
    }

    const setTranscriptResult = pipelineJob.setTranscript(result.getValue());
    if (setTranscriptResult.isFailure) {
      pipelineJob.markFailed("transcription_failed", setTranscriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", setTranscriptResult.getError().message);
      throw setTranscriptResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("timestamp_mapping");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("transcription_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", transitionResult.getError().message);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);

    await this.queueService.enqueue({ stage: "timestamp_mapping", jobId });
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
