import type {
  SceneBoundary,
  SceneDirection,
  WordTimestamp,
  AnimationTheme,
  LayoutProfile,
} from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface DirectionGenerator {
  generateDirection(params: {
    scene: SceneBoundary;
    words: WordTimestamp[];
    theme: AnimationTheme;
    layoutProfile: LayoutProfile;
    previousDirection?: SceneDirection;
  }): Promise<Result<SceneDirection, PipelineError>>;
}
