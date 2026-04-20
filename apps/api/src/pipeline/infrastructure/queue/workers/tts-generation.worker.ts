import type { Job } from "bullmq";
import type { ProgressEvent } from "@video-ai/shared";
import { DEFAULT_VOICE_SETTINGS } from "@video-ai/shared";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";

export class TTSGenerationWorker {
  private seq = 0;

  constructor(
    private readonly ttsService: TTSService,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
    private readonly voiceId: string,
    private readonly eventPublisher: StreamEventPublisher,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const approvedScript = pipelineJob.approvedScript;
    if (!approvedScript) {
      pipelineJob.markFailed("tts_generation_failed", `Pipeline job ${jobId} has no approved script`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "tts_generation_failed", `Pipeline job ${jobId} has no approved script`);
      throw new Error(`Pipeline job ${jobId} has no approved script`);
    }

    const voiceId = pipelineJob.voiceId ?? this.voiceId;
    const voiceSettings = pipelineJob.voiceSettings ?? DEFAULT_VOICE_SETTINGS;

    // ElevenLabs with-timestamps returns audio + word-level timestamps in one call
    const result = await this.ttsService.generateSpeech({
      text: approvedScript,
      voiceId,
      voiceSettings,
    });

    if (result.isFailure) {
      pipelineJob.markFailed("tts_generation_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "tts_generation_failed", result.getError().message);
      throw result.getError();
    }

    const { audioPath, timestamps } = result.getValue();

    // Set audio path
    const setAudioResult = pipelineJob.setAudioPath(audioPath);
    if (setAudioResult.isFailure) {
      pipelineJob.markFailed(
        "tts_generation_failed",
        setAudioResult.getError().message,
      );
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "tts_generation_failed", setAudioResult.getError().message);
      throw setAudioResult.getError();
    }

    // Transition through transcription stage (we already have timestamps)
    const toTranscription = pipelineJob.transitionTo("transcription");
    if (toTranscription.isFailure) {
      pipelineJob.markFailed(
        "tts_generation_failed",
        toTranscription.getError().message,
      );
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "tts_generation_failed", toTranscription.getError().message);
      throw toTranscription.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);

    // Set transcript from ElevenLabs alignment data
    const setTranscriptResult = pipelineJob.setTranscript(timestamps);
    if (setTranscriptResult.isFailure) {
      pipelineJob.markFailed(
        "transcription_failed",
        setTranscriptResult.getError().message,
      );
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", setTranscriptResult.getError().message);
      throw setTranscriptResult.getError();
    }

    // Skip transcription worker — go straight to timestamp_mapping
    const toTimestampMapping = pipelineJob.transitionTo("timestamp_mapping");
    if (toTimestampMapping.isFailure) {
      pipelineJob.markFailed(
        "transcription_failed",
        toTimestampMapping.getError().message,
      );
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "transcription_failed", toTimestampMapping.getError().message);
      throw toTimestampMapping.getError();
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);

    // Enqueue timestamp_mapping directly (skipping transcription worker)
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
