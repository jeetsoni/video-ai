import type { ScenePlan, AnimationTheme, LayoutProfile } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface CodeGenerator {
  generateCode(params: {
    scenePlan: ScenePlan;
    theme: AnimationTheme;
    layoutProfile: LayoutProfile;
    overlapFeedback?: string;
  }): Promise<Result<string, PipelineError>>;
}
