import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { TweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/tweak-message-repository.js";
import type { TweakMessageDto } from "@video-ai/shared";

export interface GetTweakMessagesRequest {
  jobId: string;
}

export interface GetTweakMessagesResponse {
  messages: TweakMessageDto[];
}

export class GetTweakMessagesUseCase
  implements
    UseCase<GetTweakMessagesRequest, Result<GetTweakMessagesResponse, ValidationError>>
{
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly tweakMessageRepository: TweakMessageRepository,
  ) {}

  async execute(
    request: GetTweakMessagesRequest,
  ): Promise<Result<GetTweakMessagesResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    const rawMessages = await this.tweakMessageRepository.findByJobId(request.jobId);

    const messages: TweakMessageDto[] = rawMessages.map((msg) => ({
      id: msg.id,
      jobId: msg.jobId,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    }));

    return Result.ok({ messages });
  }
}
