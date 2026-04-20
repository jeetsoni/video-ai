import type { Job } from "bullmq";
import type { ScenePlan, ProgressEvent } from "@video-ai/shared";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type { LayoutValidator } from "@/pipeline/application/interfaces/layout-validator.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import { ANIMATION_THEMES, getLayoutProfile } from "@video-ai/shared";

const MAX_VALIDATION_RETRIES = 2;

export class CodeGenerationWorker {
  private seq = 0;

  constructor(
    private readonly codeGenerator: CodeGenerator,
    private readonly jobRepository: PipelineJobRepository,
    private readonly objectStore: ObjectStore,
    private readonly layoutValidator: LayoutValidator,
    private readonly eventPublisher: StreamEventPublisher,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;

    const pipelineJob = await this.jobRepository.findById(jobId);
    if (!pipelineJob) {
      throw new Error(`Pipeline job not found: ${jobId}`);
    }

    const sceneDirections = pipelineJob.sceneDirections;
    if (!sceneDirections) {
      pipelineJob.markFailed("code_generation_failed", `Pipeline job ${jobId} has no scene directions`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Pipeline job ${jobId} has no scene directions`);
      throw new Error(`Pipeline job ${jobId} has no scene directions`);
    }

    const transcript = pipelineJob.transcript;
    if (!transcript) {
      pipelineJob.markFailed("code_generation_failed", `Pipeline job ${jobId} has no transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Pipeline job ${jobId} has no transcript`);
      throw new Error(`Pipeline job ${jobId} has no transcript`);
    }

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
      pipelineJob.markFailed("code_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      throw new Error(`Animation theme not found: ${pipelineJob.themeId.value}`);
    }

    const lastWord = transcript[transcript.length - 1];
    if (!lastWord) {
      pipelineJob.markFailed("code_generation_failed", `Pipeline job ${jobId} has an empty transcript`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Pipeline job ${jobId} has an empty transcript`);
      throw new Error(`Pipeline job ${jobId} has an empty transcript`);
    }

    const layoutProfile = getLayoutProfile("faceless");

    const scenePlan: ScenePlan = {
      title: pipelineJob.topic,
      totalDuration: lastWord.end,
      fps: 30,
      totalFrames: Math.round(lastWord.end * 30),
      designSystem: {
        background: theme.background,
        surface: theme.surface,
        raised: theme.raised,
        textPrimary: theme.textPrimary,
        textMuted: theme.textMuted,
        accents: theme.accents,
      },
      scenes: sceneDirections,
    };

    let code: string = "";
    let overlapFeedback: string | undefined;

    for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      const result = await this.codeGenerator.generateCode({
        scenePlan,
        theme,
        layoutProfile,
        overlapFeedback,
      });
      if (result.isFailure) {
        pipelineJob.markFailed("code_generation_failed", result.getError().message);
        await this.jobRepository.save(pipelineJob);
        await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", result.getError().message);
        throw result.getError();
      }
      code = result.getValue();

      const validationResult = await this.layoutValidator.validate({
        code,
        layoutProfile,
        scenePlan,
      });

      if (validationResult.isFailure) {
        // Validator itself errored — proceed to rendering (non-blocking)
        break;
      }

      const validation = validationResult.getValue();
      if (validation.valid) {
        // No errors (may have warnings) — proceed
        break;
      }

      if (attempt < MAX_VALIDATION_RETRIES) {
        overlapFeedback = validation.summary;
        continue;
      }

      // All retries exhausted
      pipelineJob.markFailed(
        "code_generation_failed",
        `Layout validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts: ${validation.summary}`,
      );
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Layout validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts: ${validation.summary}`);
      throw new Error(`Layout validation failed: ${validation.summary}`);
    }

    const uploadResult = await this.objectStore.upload({
      key: `code/${jobId}.tsx`,
      data: Buffer.from(code),
      contentType: "text/typescript",
    });

    if (uploadResult.isFailure) {
      pipelineJob.markFailed("code_generation_failed", uploadResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", uploadResult.getError().message);
      throw uploadResult.getError();
    }

    const codePath = uploadResult.getValue();

    const setCodeResult = pipelineJob.setGeneratedCode(code, codePath);
    if (setCodeResult.isFailure) {
      pipelineJob.markFailed("code_generation_failed", setCodeResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", setCodeResult.getError().message);
      throw setCodeResult.getError();
    }

    const transitionResult = pipelineJob.transitionTo("preview");
    if (transitionResult.isFailure) {
      pipelineJob.markFailed("code_generation_failed", transitionResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", transitionResult.getError().message);
      throw transitionResult.getError();
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
