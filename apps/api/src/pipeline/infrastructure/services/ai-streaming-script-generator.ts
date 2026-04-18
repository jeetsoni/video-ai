import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import { FORMAT_WORD_RANGES, sceneBlockSchema } from "@video-ai/shared";
import type {
  StreamingScriptGenerator,
} from "@/pipeline/application/interfaces/streaming-script-generator.js";
import type { ScriptGenerationResult } from "@/pipeline/application/interfaces/script-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

interface SceneBlock {
  id: number;
  name: string;
  type:
    | "Hook"
    | "Analogy"
    | "Bridge"
    | "Architecture"
    | "Spotlight"
    | "Comparison"
    | "Power"
    | "CTA";
  text: string;
}

export interface AIStreamingScriptGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIStreamingScriptGeneratorConfig = {
  model: "gpt-4o",
  temperature: 0.7,
};

const VALID_SCENE_TYPES = new Set([
  "Hook", "Analogy", "Bridge", "Architecture",
  "Spotlight", "Comparison", "Power", "CTA",
]);

function getSceneCountRange(format: VideoFormat): { min: number; max: number } {
  if (format === "reel" || format === "short") {
    return { min: 2, max: 4 };
  }
  return { min: 3, max: 15 };
}

/** Scenes-only schema for streaming — forces the LLM to generate scenes
 *  sequentially so we get interleaved scene metadata + text chunks. */
const streamingScriptSchema = z.object({
  scenes: z.array(sceneBlockSchema).min(2).max(15),
});

function buildSystemPrompt(
  wordRange: { min: number; max: number },
  sceneRange: { min: number; max: number },
): string {
  return [
    "You are an expert educational video scriptwriter.",
    "Write a script for a short-form educational video narration, structured into named scene blocks.",
    "",
    "Requirements:",
    `- The total word count across all scenes MUST be between ${wordRange.min} and ${wordRange.max} words.`,
    `- Produce between ${sceneRange.min} and ${sceneRange.max} scene blocks.`,
    "- Each scene block must have:",
    "  - id: a sequential number starting from 1",
    "  - name: a short descriptive name for the scene",
    "  - type: one of Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA",
    "  - text: the spoken narration text for that scene",
    "- The FIRST scene MUST have type \"Hook\".",
    "- The LAST scene MUST have type \"CTA\".",
    "- Use clear, conversational language suitable for voiceover narration.",
    "- Do NOT include stage directions, scene markers, or formatting in the text — output only the spoken narration text.",
    "- Do NOT include any markdown formatting.",
  ].join("\n");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isCompleteScene(scene: Partial<SceneBlock> | undefined): scene is SceneBlock {
  if (!scene) return false;
  return (
    typeof scene.id === "number" &&
    typeof scene.name === "string" &&
    scene.name.length > 0 &&
    typeof scene.type === "string" &&
    VALID_SCENE_TYPES.has(scene.type) &&
    typeof scene.text === "string" &&
    scene.text.length > 0
  );
}

export class AIStreamingScriptGenerator implements StreamingScriptGenerator {
  private readonly config: AIStreamingScriptGeneratorConfig;

  constructor(config?: Partial<AIStreamingScriptGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateStream(params: {
    topic: string;
    format: VideoFormat;
    onChunk: (text: string) => void;
    onScene: (scene: SceneBoundary) => void;
    onDone: (result: ScriptGenerationResult) => void;
    onError: (error: PipelineError) => void;
  }): Promise<Result<ScriptGenerationResult, PipelineError>> {
    const wordRange = FORMAT_WORD_RANGES[params.format];
    const sceneRange = getSceneCountRange(params.format);

    try {
      const { partialObjectStream, object: objectPromise } = streamObject({
        model: openai(this.config.model),
        schema: streamingScriptSchema,
        system: buildSystemPrompt(wordRange, sceneRange),
        prompt: params.topic,
        temperature: this.config.temperature,
      });

      let emittedSceneCount = 0;
      // Track how much text we've emitted per scene (by index)
      const sceneTextEmitted: number[] = [];

      for await (const partial of partialObjectStream) {
        const scenes = partial.scenes ?? [];

        // Stream text from scenes as they build up.
        for (let i = 0; i < scenes.length; i++) {
          const candidate = scenes[i];
          if (!candidate || typeof candidate.text !== "string") continue;

          const prevLength = sceneTextEmitted[i] ?? 0;
          if (candidate.text.length > prevLength) {
            const newText = candidate.text.slice(prevLength);
            params.onChunk(newText);
            sceneTextEmitted[i] = candidate.text.length;
          }
        }

        // A scene is complete when the NEXT scene has started appearing.
        // This means the LLM has moved on from the current scene.
        while (emittedSceneCount < scenes.length - 1) {
          const completedScene = scenes[emittedSceneCount];
          if (!completedScene || !isCompleteScene(completedScene)) break;

          params.onScene({
            id: completedScene.id,
            name: completedScene.name,
            type: completedScene.type,
            startTime: 0,
            endTime: 0,
            text: completedScene.text,
          });
          emittedSceneCount++;
        }
      }

      // Emit any remaining scenes that weren't emitted during streaming
      // (the last scene never has a "next" scene to trigger it)
      const finalPartialScenes = (await objectPromise).scenes;
      for (let i = emittedSceneCount; i < finalPartialScenes.length; i++) {
        const scene = finalPartialScenes[i]!;
        params.onScene({
          id: scene.id,
          name: scene.name,
          type: scene.type as SceneBoundary["type"],
          startTime: 0,
          endTime: 0,
          text: scene.text,
        });
      }

      // Validate the final result
      const sceneBlocks = finalPartialScenes;

      if (sceneBlocks.length < 2 || sceneBlocks.length > 15) {
        const error = PipelineError.scriptGenerationFailed(
          `Invalid scene count: ${sceneBlocks.length}. Expected between 2 and 15.`,
        );
        params.onError(error);
        return Result.fail(error);
      }

      for (const scene of sceneBlocks) {
        if (!VALID_SCENE_TYPES.has(scene.type)) {
          const error = PipelineError.scriptGenerationFailed(
            `Invalid scene type: "${scene.type}" in scene ${scene.id}`,
          );
          params.onError(error);
          return Result.fail(error);
        }
      }

      const scenes: SceneBoundary[] = sceneBlocks.map((block: SceneBlock) => ({
        id: block.id,
        name: block.name,
        type: block.type,
        startTime: 0,
        endTime: 0,
        text: block.text,
      }));

      const canonicalScript = normalizeWhitespace(
        sceneBlocks.map((s: SceneBlock) => s.text).join(" "),
      );

      const result: ScriptGenerationResult = { script: canonicalScript, scenes };
      params.onDone(result);
      return Result.ok(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown script generation error";
      const pipelineError = PipelineError.scriptGenerationFailed(
        `Script generation failed: ${message}`,
      );
      params.onError(pipelineError);
      return Result.fail(pipelineError);
    }
  }
}
