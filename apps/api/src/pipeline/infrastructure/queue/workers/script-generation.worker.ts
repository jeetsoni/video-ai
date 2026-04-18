import type { Job } from "bullmq";
import type { ScriptGenerator } from "@/pipeline/application/interfaces/script-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

export class ScriptGenerationWorker {
  constructor(
    private readonly scriptGenerator: ScriptGenerator,
    private readonly jobRepository: PipelineJobRepository,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const result = await this.scriptGenerator.generate({
      topic: pipelineJob.topic,
      format: pipelineJob.format.value,
    });

    if (result.isFailure) {
      throw result.getError();
    }

    const { script, scenes } = result.getValue();
    const setScriptResult = pipelineJob.setScript(script, scenes);
    if (setScriptResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", setScriptResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw setScriptResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("script_review");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("script_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      throw transitionResult.getError();
    }

    await this.jobRepository.save(pipelineJob);
  }
}
