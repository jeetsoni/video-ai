import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface TimestampMapper {
  mapTimestamps(params: {
    scenes: SceneBoundary[];
    transcript: WordTimestamp[];
  }): Result<SceneBoundary[], PipelineError>;
}
