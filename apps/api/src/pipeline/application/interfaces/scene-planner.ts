import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface ScenePlanner {
  planScenes(params: {
    transcript: WordTimestamp[];
    fullText: string;
    totalDuration: number;
  }): Promise<Result<SceneBoundary[], PipelineError>>;
}
