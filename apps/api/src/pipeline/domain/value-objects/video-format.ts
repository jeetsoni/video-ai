import type { VideoFormat as VideoFormatType } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";

const VALID_FORMATS: readonly VideoFormatType[] = [
  "reel",
  "short",
  "longform",
] as const;

export class VideoFormat {
  private constructor(private readonly _value: VideoFormatType) {}

  get value(): VideoFormatType {
    return this._value;
  }

  static create(value: string): Result<VideoFormat, ValidationError> {
    if (!VALID_FORMATS.includes(value as VideoFormatType)) {
      return Result.fail(
        new ValidationError(
          `Invalid video format "${value}". Supported formats: ${VALID_FORMATS.join(", ")}`,
          "INVALID_VIDEO_FORMAT",
        ),
      );
    }
    return Result.ok(new VideoFormat(value as VideoFormatType));
  }

  equals(other: VideoFormat): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
