import type { PipelineErrorCode } from "@video-ai/shared";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;

  constructor(message: string, code: PipelineErrorCode) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }

  static scriptGenerationFailed(message: string): PipelineError {
    return new PipelineError(message, "script_generation_failed");
  }

  static ttsGenerationFailed(message: string): PipelineError {
    return new PipelineError(message, "tts_generation_failed");
  }

  static transcriptionFailed(message: string): PipelineError {
    return new PipelineError(message, "transcription_failed");
  }

  static timestampMappingFailed(message: string): PipelineError {
    return new PipelineError(message, "timestamp_mapping_failed");
  }

  static directionGenerationFailed(message: string): PipelineError {
    return new PipelineError(message, "direction_generation_failed");
  }

  static codeGenerationFailed(message: string): PipelineError {
    return new PipelineError(message, "code_generation_failed");
  }

  static renderingFailed(message: string): PipelineError {
    return new PipelineError(message, "rendering_failed");
  }

  static fromCode(code: PipelineErrorCode, message: string): PipelineError {
    return new PipelineError(message, code);
  }
}
