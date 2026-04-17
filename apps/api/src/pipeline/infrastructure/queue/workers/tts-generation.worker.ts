import type { Job } from "bullmq";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

export class TTSGenerationWorker {
  constructor(
    private readonly ttsService: TTSService,
    private readonly jobRepository: PipelineJobRepository,
    private readonly queueService: QueueService,
    private readonly voiceId: string,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const approvedScript = pipelineJob.approvedScript;
    if (!approvedScript) {
      throw new Error(`Pipeline job ${jobId} has no approved script`);
    }

    // ElevenLabs with-timestamps returns audio + word-level timestamps in one call
    const result = await this.ttsService.generateSpeech({
      text: approvedScript,
      voiceId: this.voiceId,
    });

    if (result.isFailure) {
      throw result.getError();
    }

    const { audioPath, timestamps } = result.getValue();

    // Set audio path
    const setAudioResult = pipelineJob.setAudioPath(audioPath);
    if (setAudioResult.isFailure) {
      pipelineJob.markFailed("tts_generation_failed", setAudioResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setAudioResult.getError();
    }

    // Transition through transcription stage (we already have timestamps)
    const toTranscription = pipelineJob.transitionTo("transcription");
    if (toTranscription.isFailure) {
      pipelineJob.markFailed("tts_generation_failed", toTranscription.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw toTranscription.getError();
    }

    // Set transcript from ElevenLabs alignment data
    const setTranscriptResult = pipelineJob.setTranscript(timestamps);
    if (setTranscriptResult.isFailure) {
      pipelineJob.markFailed("transcription_failed", setTranscriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setTranscriptResult.getError();
    }

    // Skip transcription worker — go straight to scene_planning
    const toScenePlanning = pipelineJob.transitionTo("scene_planning");
    if (toScenePlanning.isFailure) {
      pipelineJob.markFailed("transcription_failed", toScenePlanning.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw toScenePlanning.getError();
    }

    await this.jobRepository.save(pipelineJob);

    // Enqueue scene_planning directly (skipping transcription worker)
    await this.queueService.enqueue({ stage: "scene_planning", jobId });
  }
}
