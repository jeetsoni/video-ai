import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ScriptTweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";
import type { ScriptTweaker } from "@/pipeline/application/interfaces/script-tweaker.js";
import type { TweakMessageDto, SceneBoundary } from "@video-ai/shared";

export interface SendScriptTweakRequest {
  jobId: string;
  message: string;
}

export interface SendScriptTweakResponse {
  updatedScript: string;
  explanation: string;
  updatedScenes: SceneBoundary[];
}

/**
 * Rebuild scene boundaries after a script tweak by re-distributing the
 * updated script text across the existing scene structure.
 *
 * The canonical script is the concatenation of all scene text fields joined
 * by a single space. After a tweak, we walk through the existing scenes and
 * try to locate each scene's original text in the new script sequentially.
 * Scenes whose text was not modified keep their original text. For scenes
 * whose text was edited, we compute the new text based on surrounding anchors.
 */
export function rebuildScenes(
  updatedScript: string,
  existingScenes: SceneBoundary[],
): SceneBoundary[] {
  if (existingScenes.length === 0) {
    return [];
  }

  // Try to find each scene's text in the updated script sequentially
  const located: Array<{
    sceneIndex: number;
    startIdx: number;
    endIdx: number;
  }> = [];

  let searchFrom = 0;
  for (let i = 0; i < existingScenes.length; i++) {
    const scene = existingScenes[i]!;
    const idx = updatedScript.indexOf(scene.text, searchFrom);
    if (idx !== -1) {
      located.push({
        sceneIndex: i,
        startIdx: idx,
        endIdx: idx + scene.text.length,
      });
      searchFrom = idx + scene.text.length;
    }
  }

  // If no scenes could be located, fall back to a single scene with the full script
  if (located.length === 0) {
    const first = existingScenes[0]!;
    return [
      {
        ...first,
        id: 1,
        text: updatedScript,
      },
    ];
  }

  const rebuilt: SceneBoundary[] = [];

  for (let i = 0; i < existingScenes.length; i++) {
    const scene = existingScenes[i]!;
    const locatedEntry = located.find((l) => l.sceneIndex === i);

    if (locatedEntry) {
      rebuilt.push({ ...scene });
    } else {
      // Scene text was modified — compute new text from surrounding anchors
      const prevLocated = located.filter((l) => l.sceneIndex < i);
      const nextLocated = located.filter((l) => l.sceneIndex > i);

      const textStart =
        prevLocated.length > 0
          ? prevLocated[prevLocated.length - 1]!.endIdx
          : 0;

      const textEnd =
        nextLocated.length > 0
          ? nextLocated[0]!.startIdx
          : updatedScript.length;

      const newText = updatedScript.slice(textStart, textEnd).trim();

      rebuilt.push({ ...scene, text: newText });
    }
  }

  return rebuilt;
}

export class SendScriptTweakUseCase implements UseCase<
  SendScriptTweakRequest,
  Result<SendScriptTweakResponse, ValidationError>
> {
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly scriptTweakMessageRepository: ScriptTweakMessageRepository,
    private readonly scriptTweaker: ScriptTweaker,
  ) {}

  async execute(
    request: SendScriptTweakRequest,
  ): Promise<Result<SendScriptTweakResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    const stage = job.stage.value;
    if (stage !== "script_review") {
      return Result.fail(
        new ValidationError(
          `Job is in "${stage}" stage, script tweaks are only available in script_review stage`,
          "CONFLICT",
        ),
      );
    }

    const currentScript = job.generatedScript;
    if (!currentScript) {
      return Result.fail(
        new ValidationError(
          "Job has no generated script to tweak",
          "NOT_FOUND",
        ),
      );
    }

    // Persist the user message
    await this.scriptTweakMessageRepository.create({
      jobId: request.jobId,
      role: "user",
      content: request.message,
    });

    // Fetch last 10 messages for context
    const recentMessages =
      await this.scriptTweakMessageRepository.findRecentByJobId(
        request.jobId,
        10,
      );

    const chatHistory: TweakMessageDto[] = recentMessages.map((msg) => ({
      id: msg.id,
      jobId: msg.jobId,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    }));

    // Call the AI script tweaker
    const tweakResult = await this.scriptTweaker.tweakScript({
      currentScript,
      message: request.message,
      chatHistory,
    });

    if (tweakResult.isFailure) {
      // Persist the error as an assistant message
      await this.scriptTweakMessageRepository.create({
        jobId: request.jobId,
        role: "assistant",
        content: tweakResult.getError().message,
      });

      return Result.fail(
        new ValidationError(tweakResult.getError().message, "TWEAK_FAILED"),
      );
    }

    const { tweakedScript, explanation } = tweakResult.getValue();

    // Re-parse scene boundaries from the updated script
    const existingScenes = job.generatedScenes ?? [];
    const updatedScenes = rebuildScenes(tweakedScript, existingScenes);

    // Update the job with the tweaked script and rebuilt scenes
    job.updateGeneratedScript(tweakedScript, updatedScenes);
    await this.repository.save(job);

    // Persist the assistant message with the explanation
    await this.scriptTweakMessageRepository.create({
      jobId: request.jobId,
      role: "assistant",
      content: explanation,
    });

    return Result.ok({
      updatedScript: tweakedScript,
      explanation,
      updatedScenes,
    });
  }
}
