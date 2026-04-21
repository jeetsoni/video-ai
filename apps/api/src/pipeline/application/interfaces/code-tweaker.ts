import type { TweakMessageDto } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface CodeTweakParams {
  currentCode: string;
  message: string;
  screenshot?: string;
  currentFrame?: number;
  currentTimeSeconds?: number;
  chatHistory: TweakMessageDto[];
}

export interface CodeTweakResult {
  tweakedCode: string;
  explanation: string;
}

export interface CodeTweaker {
  tweakCode(params: CodeTweakParams): Promise<Result<CodeTweakResult, PipelineError>>;
}
