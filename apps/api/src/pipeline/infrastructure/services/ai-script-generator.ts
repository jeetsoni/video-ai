import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { VideoFormat } from "@video-ai/shared";
import { FORMAT_WORD_RANGES } from "@video-ai/shared";
import type { ScriptGenerator } from "@/pipeline/application/interfaces/script-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AIScriptGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIScriptGeneratorConfig = {
  model: "gpt-4o",
  temperature: 0.7,
};

function buildSystemPrompt(wordRange: { min: number; max: number }): string {
  return [
    "You are an expert educational video scriptwriter.",
    "Write a script for a short-form educational video narration.",
    "",
    "Requirements:",
    `- The script MUST be between ${wordRange.min} and ${wordRange.max} words.`,
    "- Open with a compelling hook that grabs attention in the first sentence.",
    "- Follow with clear, educational body sections that explain the topic.",
    "- Close with a strong call-to-action.",
    "- Use clear, conversational language suitable for voiceover narration.",
    "- Do NOT include stage directions, scene markers, or formatting — output only the spoken narration text.",
    "- Do NOT include any markdown formatting.",
  ].join("\n");
}

export class AIScriptGenerator implements ScriptGenerator {
  private readonly config: AIScriptGeneratorConfig;

  constructor(config?: Partial<AIScriptGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generate(params: {
    topic: string;
    format: VideoFormat;
  }): Promise<Result<string, PipelineError>> {
    const wordRange = FORMAT_WORD_RANGES[params.format];

    try {
      const { text } = await generateText({
        model: openai(this.config.model),
        system: buildSystemPrompt(wordRange),
        prompt: params.topic,
        temperature: this.config.temperature,
      });

      if (!text || text.trim().length === 0) {
        return Result.fail(
          PipelineError.scriptGenerationFailed("LLM returned empty script output")
        );
      }

      return Result.ok(text.trim());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown script generation error";
      return Result.fail(
        PipelineError.scriptGenerationFailed(`Script generation failed: ${message}`)
      );
    }
  }
}
