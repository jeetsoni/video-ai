import type { PipelineStatus as PipelineStatusType } from "@video-ai/shared";

const VALID_STATUSES: readonly PipelineStatusType[] = [
  "pending",
  "processing",
  "awaiting_script_review",
  "completed",
  "failed",
] as const;

export class PipelineStatus {
  private constructor(private readonly _value: PipelineStatusType) {}

  get value(): PipelineStatusType {
    return this._value;
  }

  static create(value: string): PipelineStatus | null {
    if (!VALID_STATUSES.includes(value as PipelineStatusType)) {
      return null;
    }
    return new PipelineStatus(value as PipelineStatusType);
  }

  static pending(): PipelineStatus {
    return new PipelineStatus("pending");
  }

  static processing(): PipelineStatus {
    return new PipelineStatus("processing");
  }

  static awaitingScriptReview(): PipelineStatus {
    return new PipelineStatus("awaiting_script_review");
  }

  static completed(): PipelineStatus {
    return new PipelineStatus("completed");
  }

  static failed(): PipelineStatus {
    return new PipelineStatus("failed");
  }

  isTerminal(): boolean {
    return this._value === "completed" || this._value === "failed";
  }

  isReview(): boolean {
    return this._value === "awaiting_script_review";
  }

  equals(other: PipelineStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  static allStatuses(): readonly PipelineStatusType[] {
    return VALID_STATUSES;
  }
}
