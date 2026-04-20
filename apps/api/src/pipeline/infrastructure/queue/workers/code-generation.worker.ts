import type { Job } from "bullmq";
import type { ProgressEvent, SceneDirection } from "@video-ai/shared";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import { ANIMATION_THEMES, getLayoutProfile } from "@video-ai/shared";

export class CodeGenerationWorker {
  private seq = 0;

  constructor(
    private readonly codeGenerator: CodeGenerator,
    private readonly jobRepository: PipelineJobRepository,
    private readonly objectStore: ObjectStore,
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

    const theme = ANIMATION_THEMES.find((t) => t.id === pipelineJob.themeId.value);
    if (!theme) {
      pipelineJob.markFailed("code_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", `Animation theme not found: ${pipelineJob.themeId.value}`);
      throw new Error(`Animation theme not found: ${pipelineJob.themeId.value}`);
    }

    const layoutProfile = getLayoutProfile("faceless");

    // Generate code for all scenes in parallel, emitting progress as each completes
    const sceneCodes: (string | null)[] = new Array(sceneDirections.length).fill(null);

    const results = await Promise.allSettled(
      sceneDirections.map(async (scene, index) => {
        // Emit "generating" event for this scene
        await this.publishSceneProgress(jobId, scene, "generating");

        const result = await this.codeGenerator.generateSceneCode({ scene, theme, layoutProfile });

        if (result.isFailure) {
          await this.publishSceneProgress(jobId, scene, "failed");
          throw result.getError();
        }

        const code = result.getValue();
        sceneCodes[index] = code;

        // Emit "completed" event with the scene code so frontend can preview immediately
        await this.publishSceneProgress(jobId, scene, "completed", code);

        return code;
      })
    );

    // Check for failures
    const finalCodes: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "rejected") {
        const reason = result.reason;
        const errorMsg = reason instanceof Error ? reason.message : String(reason);
        pipelineJob.markFailed("code_generation_failed", errorMsg);
        await this.jobRepository.save(pipelineJob);
        await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", errorMsg);
        throw reason;
      }
      finalCodes.push(result.value);
    }

    // Compose the final component that renders all scenes
    const composedCode = composeSceneComponents(finalCodes, sceneDirections, theme);

    const uploadResult = await this.objectStore.upload({
      key: `code/${jobId}.tsx`,
      data: Buffer.from(composedCode),
      contentType: "text/typescript",
    });

    if (uploadResult.isFailure) {
      pipelineJob.markFailed("code_generation_failed", uploadResult.getError().message);
      await this.jobRepository.save(pipelineJob);
      await this.publishProgressEvent(jobId, pipelineJob.stage.value, "failed", pipelineJob.progressPercent, "code_generation_failed", uploadResult.getError().message);
      throw uploadResult.getError();
    }

    const codePath = uploadResult.getValue();

    const setCodeResult = pipelineJob.setGeneratedCode(composedCode, codePath);
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

  private async publishSceneProgress(
    jobId: string,
    scene: SceneDirection,
    status: "generating" | "completed" | "failed",
    code?: string,
  ): Promise<void> {
    const event: ProgressEvent = {
      type: "progress",
      seq: ++this.seq,
      data: {
        stage: "code_generation",
        status: "processing",
        progressPercent: 80,
        sceneProgress: {
          sceneId: scene.id,
          sceneName: scene.name,
          status,
          ...(code ? { code } : {}),
        },
      },
    };
    await this.eventPublisher.publish(`stream:progress:${jobId}`, { ...event });
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

/**
 * Strip import/export statements from AI-generated code.
 * The code evaluator uses new Function() which doesn't support ES modules.
 */
function stripModuleStatements(code: string): string {
  return code
    // Remove import statements (handles multiple on same line and multiline)
    .replace(/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+["'][^"']+["'];?/g, "")
    // Remove simple import side-effect statements like: import "module";
    .replace(/import\s+["'][^"']+["'];?/g, "")
    // Remove export default
    .replace(/export\s+default\s+/g, "")
    // Remove named exports
    .replace(/export\s+(?=(?:const|let|var|function|class|async)\s)/g, "")
    // Remove destructuring from React that tries to get Remotion globals
    .replace(/const\s+\{[^}]*\}\s*=\s*React\s*;?/g, "")
    .trim();
}

/**
 * Compose individual scene components into a single Main component
 * that uses Sequence to render each scene at the correct time.
 */
function composeSceneComponents(
  sceneCodes: string[],
  scenes: SceneDirection[],
  theme: { background: string },
): string {
  // Each scene code defines its own `function Main({ scene })`.
  // We rename them to Scene1, Scene2, etc. and compose them.
  const renamedScenes = sceneCodes.map((code, i) => {
    const cleaned = stripModuleStatements(code);
    return cleaned.replace(/function\s+Main\s*\(\s*\{\s*scene\s*\}\s*\)/, `function Scene${i + 1}({ scene })`);
  });

  const sceneImports = renamedScenes.join("\n\n");

  const sceneRenderers = scenes.map((scene, i) => {
    return `      <Sequence key={${scene.id}} from={${scene.startFrame}} durationInFrames={${scene.durationFrames}}>
        <Scene${i + 1} scene={scenePlan.scenes[${i}]} />
      </Sequence>`;
  }).join("\n");

  return `${sceneImports}

function Main({ scenePlan }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "${theme.background}" }}>
${sceneRenderers}
    </AbsoluteFill>
  );
}`;
}
