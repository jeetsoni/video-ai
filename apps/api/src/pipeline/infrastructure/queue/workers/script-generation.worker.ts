import type { Job } from "bullmq";
import type { ScriptStreamEvent } from "@video-ai/shared";
import type { StreamingScriptGenerator } from "@/pipeline/application/interfaces/streaming-script-generator.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

export class ScriptGenerationWorker {
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
      return; // Don't throw — job is already marked failed, retrying would hit terminal status
    }

    const { script, scenes } = result.getValue();
    const setScriptResult = pipelineJob.setScript(script, scenes);
    if (setScriptResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", setScriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      return;
    }

    const transitionResult = pipelineJob.transitionTo("script_review");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      return;
    }

    await this.jobRepository.save(pipelineJob);
  }
}
