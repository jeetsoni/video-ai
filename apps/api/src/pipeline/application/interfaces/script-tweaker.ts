import type { TweakMessageDto } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface ScriptTweakParams {
  currentScript: string;
  message: string;
  chatHistory: TweakMessageDto[];
}

export interface ScriptTweakResult {
  tweakedScript: string;
  explanation: string;
}

export interface ScriptTweaker {
  tweakScript(
    params: ScriptTweakParams,
  ): Promise<Result<ScriptTweakResult, PipelineError>>;
}
