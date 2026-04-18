import type { LayoutProfile, ScenePlan, ValidationResult } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface LayoutValidator {
  validate(params: {
    code: string;
    layoutProfile: LayoutProfile;
    scenePlan: ScenePlan;
  }): Promise<Result<ValidationResult, PipelineError>>;
}
