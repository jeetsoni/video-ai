import type { SceneDirection, AnimationTheme, LayoutProfile } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface CodeGenerator {
  generateSceneCode(params: {
    scene: SceneDirection;
    theme: AnimationTheme;
    layoutProfile: LayoutProfile;
  }): Promise<Result<string, PipelineError>>;
}
