import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface CodeFixParams {
  currentCode: string;
  errorMessage: string;
  errorType: string;
  sceneContext?: string;
}

export interface CodeFixResult {
  fixedCode: string;
  explanation: string;
}

export interface CodeAutoFixer {
  fixCode(params: CodeFixParams): Promise<Result<CodeFixResult, PipelineError>>;
}
