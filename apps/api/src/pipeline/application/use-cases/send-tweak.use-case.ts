import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { TweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/tweak-message-repository.js";
import type { CodeTweaker } from "@/pipeline/application/interfaces/code-tweaker.js";
import type { TweakMessageDto } from "@video-ai/shared";

export interface SendTweakRequest {
  jobId: string;
  message: string;
  screenshot?: string;
  frame?: number;
  timeSeconds?: number;
}

export interface SendTweakResponse {
  updatedCode: string;
  explanation: string;
}

export class SendTweakUseCase
  implements UseCase<SendTweakRequest, Result<SendTweakResponse, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly tweakMessageRepository: TweakMessageRepository,
    private readonly codeTweaker: CodeTweaker,
  ) {}

  async execute(
    request: SendTweakRequest,
  ): Promise<Result<SendTweakResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    const stage = job.stage.value;
    if (stage !== "preview" && stage !== "rendering" && stage !== "done") {
      return Result.fail(
        new ValidationError(
          `Job is in "${stage}" stage, tweaks are only available in preview, rendering, or done stages`,
          "CONFLICT",
        ),
      );
    }

    const currentCode = job.generatedCode;
    if (!currentCode) {
      return Result.fail(
        new ValidationError("Job has no generated code to tweak", "NOT_FOUND"),
      );
    }

    // Persist the user message
    await this.tweakMessageRepository.create({
      jobId: request.jobId,
      role: "user",
      content: request.message,
    });

    // Fetch last 10 messages for context
    const recentMessages = await this.tweakMessageRepository.findRecentByJobId(
      request.jobId,
      10,
    );

    const chatHistory: TweakMessageDto[] = recentMessages.map((msg) => ({
      id: msg.id,
      jobId: msg.jobId,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    }));

    // Call the AI code tweaker
    const tweakResult = await this.codeTweaker.tweakCode({
      currentCode,
      message: request.message,
      screenshot: request.screenshot,
      currentFrame: request.frame,
      currentTimeSeconds: request.timeSeconds,
      chatHistory,
    });

    if (tweakResult.isFailure) {
      // Persist the error as an assistant message
      await this.tweakMessageRepository.create({
        jobId: request.jobId,
        role: "assistant",
        content: tweakResult.getError().message,
      });

      return Result.fail(
        new ValidationError(tweakResult.getError().message, "TWEAK_FAILED"),
      );
    }

    const { tweakedCode, explanation } = tweakResult.getValue();

    // Update the job with the tweaked code
    job.updateGeneratedCode(tweakedCode);
    await this.repository.save(job);

    // Persist the assistant message with the explanation
    await this.tweakMessageRepository.create({
      jobId: request.jobId,
      role: "assistant",
      content: explanation,
    });

    return Result.ok({ updatedCode: tweakedCode, explanation });
  }
}
