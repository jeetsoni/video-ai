import type { WordTimestamp } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface TranscriptionService {
  transcribe(params: {
    audioPath: string;
    scriptText: string;
  }): Promise<Result<WordTimestamp[], PipelineError>>;
}
