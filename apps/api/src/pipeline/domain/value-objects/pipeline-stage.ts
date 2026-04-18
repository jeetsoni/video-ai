import type { PipelineStage as PipelineStageType } from "@video-ai/shared";

const STAGES_IN_ORDER: readonly PipelineStageType[] = [
  "script_generation",
  "script_review",
  "tts_generation",
  "transcription",
  "timestamp_mapping",
  "direction_generation",
  "code_generation",
  "preview",
  "rendering",
  "done",
] as const;

const VALID_TRANSITIONS: ReadonlyMap<PipelineStageType, readonly PipelineStageType[]> =
  new Map([
    ["script_generation", ["script_review"]],
    ["script_review", ["tts_generation", "script_generation"]],
    ["tts_generation", ["transcription"]],
    ["transcription", ["timestamp_mapping"]],
    ["timestamp_mapping", ["direction_generation"]],
    ["direction_generation", ["code_generation"]],
    ["code_generation", ["preview"]],
    ["preview", ["rendering", "done"]],
    ["rendering", ["done"]],
    ["done", []],
  ]);

export class PipelineStage {
  private constructor(private readonly _value: PipelineStageType) {}

  get value(): PipelineStageType {
    return this._value;
  }

  static create(value: string): PipelineStage | null {
    if (!STAGES_IN_ORDER.includes(value as PipelineStageType)) {
      return null;
    }
    return new PipelineStage(value as PipelineStageType);
  }

  static initial(): PipelineStage {
    return new PipelineStage("script_generation");
  }

  canTransitionTo(target: PipelineStage): boolean {
    const allowed = VALID_TRANSITIONS.get(this._value);
    return allowed !== undefined && allowed.includes(target._value);
  }

  isReviewStage(): boolean {
    return this._value === "script_review";
  }

  isTerminal(): boolean {
    return this._value === "done";
  }

  indexOf(): number {
    return STAGES_IN_ORDER.indexOf(this._value);
  }

  equals(other: PipelineStage): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  static allStages(): readonly PipelineStageType[] {
    return STAGES_IN_ORDER;
  }

  static validTransitionsFrom(stage: PipelineStageType): readonly PipelineStageType[] {
    return VALID_TRANSITIONS.get(stage) ?? [];
  }
}
