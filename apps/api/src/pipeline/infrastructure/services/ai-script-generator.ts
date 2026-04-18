import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import { FORMAT_WORD_RANGES, structuredScriptResponseSchema } from "@video-ai/shared";
import type { ScriptGenerator, ScriptGenerationResult } from "@/pipeline/application/interfaces/script-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

interface SceneBlock {
  id: number;
  name: string;
  type: "Hook" | "Analogy" | "Bridge" | "Architecture" | "Spotlight" | "Comparison" | "Power" | "CTA";
  text: string;
}

interface StructuredScriptResponse {
  script: string;
  scenes: SceneBlock[];
}

export interface AIScriptGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIScriptGeneratorConfig = {
  model: "gpt-4o",
  temperature: 0.7,
};

const VALID_SCENE_TYPES = new Set([
  "Hook", "Analogy", "Bridge", "Architecture", "Spotlight", "Comparison", "Power", "CTA",
]);

function getSceneCountRange(format: VideoFormat): { min: number; max: number } {
  if (format === "reel" || format === "short") {
    return { min: 2, max: 4 };
  }
  return { min: 3, max: 15 };
}

function buildSystemPrompt(
  wordRange: { min: number; max: number },
  sceneRange: { min: number; max: number },
): string {
  return [
    "You are an expert educational video scriptwriter.",
    "Write a script for a short-form educational video narration, structured into named scene blocks.",
    "",
    "Requirements:",
    `- The full script MUST be between ${wordRange.min} and ${wordRange.max} words.`,
    `- Produce between ${sceneRange.min} and ${sceneRange.max} scene blocks.`,
    "- Each scene block must have:",
    "  - id: a sequential number starting from 1",
    "  - name: a short descriptive name for the scene",
    "  - type: one of Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA",
    "  - text: the spoken narration text for that scene",
    "- The FIRST scene MUST have type \"Hook\".",
    "- The LAST scene MUST have type \"CTA\".",
    "- The full script field must equal the concatenation of all scene text fields joined by a single space.",
    "- Use clear, conversational language suitable for voiceover narration.",
    "- Do NOT include stage directions, scene markers, or formatting in the text — output only the spoken narration text.",
    "- Do NOT include any markdown formatting.",
  ].join("\n");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class AIScriptGenerator implements ScriptGenerator {
  private readonly config: AIScriptGeneratorConfig;

  constructor(config?: Partial<AIScriptGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generate(params: {
    topic: string;
    format: VideoFormat;
  }): Promise<Result<ScriptGenerationResult, PipelineError>> {
    const wordRange = FORMAT_WORD_RANGES[params.format];
    const sceneRange = getSceneCountRange(params.format);

    try {
      const { object } = await generateObject({
        model: openai(this.config.model),
        schema: structuredScriptResponseSchema,
        system: buildSystemPrompt(wordRange, sceneRange),
        prompt: params.topic,
        temperature: this.config.temperature,
      });

      const { script, scenes: sceneBlocks }: StructuredScriptResponse = object;

      if (!script || script.trim().length === 0) {
        return Result.fail(
          PipelineError.scriptGenerationFailed("LLM returned empty script output")
        );
      }

      // Validate scene count
      if (sceneBlocks.length < 2 || sceneBlocks.length > 15) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            `Invalid scene count: ${sceneBlocks.length}. Expected between 2 and 15.`
          )
        );
      }

      // Validate all scene types are valid
      for (const scene of sceneBlocks) {
        if (!VALID_SCENE_TYPES.has(scene.type)) {
          return Result.fail(
            PipelineError.scriptGenerationFailed(
              `Invalid scene type: "${scene.type}" in scene ${scene.id}`
            )
          );
        }
      }

      // Validate text coverage: concatenated scene texts ≈ script text
      const concatenatedSceneText = normalizeWhitespace(
        sceneBlocks.map((s) => s.text).join(" ")
      );
      const normalizedScript = normalizeWhitespace(script);

      if (concatenatedSceneText !== normalizedScript) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            "Scene text concatenation does not match the full script text"
          )
        );
      }

      // Map scene blocks to SceneBoundary with placeholder timestamps
      const scenes: SceneBoundary[] = sceneBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        type: block.type,
        startTime: 0,
        endTime: 0,
        text: block.text,
      }));

      return Result.ok({ script: script.trim(), scenes });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown script generation error";
      return Result.fail(
        PipelineError.scriptGenerationFailed(`Script generation failed: ${message}`)
      );
    }
  }
}
