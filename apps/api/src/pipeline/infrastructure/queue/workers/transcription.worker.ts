import type { Job } from "bullmq";
import type { TranscriptionService } from "@/pipeline/application/interfaces/transcription-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

export class TranscriptionWorker {
  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const audioPath = pipelineJob.audioPath;
    if (!audioPath) {
      throw new Error(`Pipeline job ${jobId} has no audio path`);
    }

    const scriptText = pipelineJob.approvedScript ?? pipelineJob.generatedScript;
    if (!scriptText) {
      throw new Error(`Pipeline job ${jobId} has no script text`);
    }

    const result = await this.transcriptionService.transcribe({ audioPath, scriptText });

    if (result.isFailure) {
      throw result.getError();
    }

    const setTranscriptResult = pipelineJob.setTranscript(result.getValue());
    if (setTranscriptResult.isFailure) {
      pipelineJob.markFailed("transcription_failed", setTranscriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setTranscriptResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("timestamp_mapping");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("transcription_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);

    await this.queueService.enqueue({ stage: "timestamp_mapping", jobId });
  }
}
