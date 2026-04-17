import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";

export class AnimationThemeId {
  private constructor(private readonly _value: string) {}

  get value(): string {
    return this._value;
  }

  static create(value: string): Result<AnimationThemeId, ValidationError> {
    if (!value || value.trim().length === 0) {
      return Result.fail(
        new ValidationError(
          "Animation theme ID must be a non-empty string",
          "INVALID_THEME_ID",
        ),
      );
    }
    return Result.ok(new AnimationThemeId(value.trim()));
  }

  equals(other: AnimationThemeId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
