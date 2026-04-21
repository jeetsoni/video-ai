import type { Job } from "bullmq";
import type { ScriptStreamEvent, ProgressEvent } from "@video-ai/shared";
import type { StreamingScriptGenerator } from "@/pipeline/application/interfaces/streaming-script-generator.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

export class ScriptGenerationWorker {
  private progressSeq = 0;

  constructor(
    private readonly streamingScriptGenerator: StreamingScriptGenerator,
    private readonly eventPublisher: StreamEventPublisher,
    private readonly jobRepository: PipelineJobRepository,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const channel = `stream:script:${jobId}`;
    const bufferKey = `stream:buffer:script:${jobId}`;
    let seq = 0;

    const publishEvent = async (event: ScriptStreamEvent): Promise<void> => {
      await this.eventPublisher.publish(channel, event);
      await this.eventPublisher.buffer(bufferKey, event);
    };

    const result = await this.streamingScriptGenerator.generateStream({
      topic: pipelineJob.topic,
      format: pipelineJob.format.value,
      onChunk: (text: string) => {
        seq++;
        const event: ScriptStreamEvent = { type: "chunk", seq, data: { text } };
        void publishEvent(event);
      },
      onScene: (scene) => {
        seq++;
        const event: ScriptStreamEvent = { type: "scene", seq, data: scene };
        void publishEvent(event);
      },
      onStatus: (message: string) => {
        seq++;
        const event: ScriptStreamEvent = { type: "status", seq, data: { message } };
        void publishEvent(event);
      },
      onDone: (genResult) => {
        seq++;
        const event: ScriptStreamEvent = {
          type: "done",
          seq,
          data: { script: genResult.script, scenes: genResult.scenes },
        };
        void publishEvent(event).then(() =>
          this.eventPublisher.markComplete(bufferKey, 3600),
        );
      },
      onError: (error) => {
        seq++;
        const event: ScriptStreamEvent = {
          type: "error",
          seq,
          data: { code: "script_generation_failed", message: error.message },
        };
        void publishEvent(event);
      },
    });

    if (result.isFailure) {
      pipelineJob.markFailed("script_generation_failed", result.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "script_generation_failed", result.getError().message);
      return; // Don't throw — job is already marked failed, retrying would hit terminal status
    }

    const { script, scenes } = result.getValue();
    const setScriptResult = pipelineJob.setScript(script, scenes);
    if (setScriptResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", setScriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "script_generation_failed", setScriptResult.getError().message);
      return;
    }

    const transitionResult = pipelineJob.transitionTo("script_review");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "script_generation_failed", transitionResult.getError().message);
      return;
    }

    await this.jobRepository.save(pipelineJob);
    await this.publishProgressEvent(jobId, pipelineJob.stage.value, pipelineJob.status.value, pipelineJob.progressPercent);
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
      seq: ++this.progressSeq,
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
