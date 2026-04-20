import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { CodeAutoFixer } from "@/pipeline/application/interfaces/code-autofixer.js";

export interface AutofixCodeRequest {
  jobId: string;
  errorMessage: string;
  errorType: string;
  sceneIndex?: number;
}

export interface AutofixCodeResponse {
  fixedCode: string;
  explanation: string;
}

export class AutofixCodeUseCase
  implements UseCase<AutofixCodeRequest, Result<AutofixCodeResponse, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly codeAutoFixer: CodeAutoFixer,
  ) {}

  async execute(
    request: AutofixCodeRequest,
  ): Promise<Result<AutofixCodeResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    if (job.stage.value !== "preview" && job.stage.value !== "done") {
      return Result.fail(
        new ValidationError(
          `Job is in "${job.stage.value}" stage, expected "preview" or "done"`,
          "CONFLICT",
        ),
      );
    }

    // Get the current code from the job
    const currentCode = job.generatedCode;
    if (!currentCode) {
      return Result.fail(
        new ValidationError("Job has no generated code to fix", "NOT_FOUND"),
      );
    }

    // Get scene directions for context
    const sceneDirections = job.sceneDirections;
    const sceneContext = sceneDirections && request.sceneIndex !== undefined
      ? sceneDirections[request.sceneIndex]
      : sceneDirections?.[0];

    // Use AI to fix the code
    const fixResult = await this.codeAutoFixer.fixCode({
      currentCode,
      errorMessage: request.errorMessage,
      errorType: request.errorType,
      sceneContext: sceneContext ? JSON.stringify(sceneContext, null, 2) : undefined,
    });

    if (fixResult.isFailure) {
      return Result.fail(
        new ValidationError(fixResult.getError().message, "AUTOFIX_FAILED"),
      );
    }

    const { fixedCode, explanation } = fixResult.getValue();

    // Update the job with the fixed code
    job.updateGeneratedCode(fixedCode);
    await this.repository.save(job);

    return Result.ok({ fixedCode, explanation });
  }
}
