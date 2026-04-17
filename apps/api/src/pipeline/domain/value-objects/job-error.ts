import type { PipelineErrorCode } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";

const VALID_ERROR_CODES: readonly PipelineErrorCode[] = [
  "script_generation_failed",
  "tts_generation_failed",
  "transcription_failed",
  "scene_planning_failed",
  "direction_generation_failed",
  "code_generation_failed",
  "rendering_failed",
] as const;

export class JobError {
  private constructor(
    private readonly _code: PipelineErrorCode,
    private readonly _message: string,
  ) {}

  get code(): PipelineErrorCode {
    return this._code;
  }

  get message(): string {
    return this._message;
  }

  static create(
    code: string,
    message: string,
  ): Result<JobError, ValidationError> {
    if (!VALID_ERROR_CODES.includes(code as PipelineErrorCode)) {
      return Result.fail(
        new ValidationError(
          `Invalid pipeline error code "${code}"`,
          "INVALID_ERROR_CODE",
        ),
      );
    }
    if (!message || message.trim().length === 0) {
      return Result.fail(
        new ValidationError(
          "Error message must be a non-empty string",
          "INVALID_ERROR_MESSAGE",
        ),
      );
    }
    return Result.ok(new JobError(code as PipelineErrorCode, message.trim()));
  }

  equals(other: JobError): boolean {
    return this._code === other._code && this._message === other._message;
  }

  toString(): string {
    return `[${this._code}] ${this._message}`;
  }
}
