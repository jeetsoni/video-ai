import type { WordTimestamp } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface TTSService {
  generateSpeech(params: {
    text: string;
    voiceId: string;
  }): Promise<Result<{ audioPath: string; format: "mp3"; timestamps: WordTimestamp[] }, PipelineError>>;
}
