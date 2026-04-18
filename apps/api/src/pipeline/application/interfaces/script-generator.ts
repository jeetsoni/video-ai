import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface ScriptGenerationResult {
  script: string;
  scenes: SceneBoundary[];
}

export interface ScriptGenerator {
  generate(params: {
    topic: string;
    format: VideoFormat;
  }): Promise<Result<ScriptGenerationResult, PipelineError>>;
}
