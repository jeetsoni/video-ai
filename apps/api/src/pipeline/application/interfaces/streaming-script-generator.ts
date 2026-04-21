import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import type { ScriptGenerationResult } from "./script-generator.js";

export interface StreamingScriptGenerator {
  generateStream(params: {
    topic: string;
    format: VideoFormat;
    onChunk: (text: string) => void;
    onScene: (scene: SceneBoundary) => void;
    onStatus: (message: string) => void;
    onDone: (result: ScriptGenerationResult) => void;
    onError: (error: PipelineError) => void;
  }): Promise<Result<ScriptGenerationResult, PipelineError>>;
}
