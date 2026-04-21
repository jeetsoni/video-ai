import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ScriptTweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";
import type { TweakMessageDto } from "@video-ai/shared";

export interface GetScriptTweakMessagesRequest {
  jobId: string;
}

export interface GetScriptTweakMessagesResponse {
  messages: TweakMessageDto[];
}

export class GetScriptTweakMessagesUseCase implements UseCase<
  GetScriptTweakMessagesRequest,
  Result<GetScriptTweakMessagesResponse, ValidationError>
> {
  constructor(
    private readonly repository: PipelineJobRepository,
    private readonly scriptTweakMessageRepository: ScriptTweakMessageRepository,
  ) {}

  async execute(
    request: GetScriptTweakMessagesRequest,
  ): Promise<Result<GetScriptTweakMessagesResponse, ValidationError>> {
    const job = await this.repository.findById(request.jobId);
    if (!job) {
      return Result.fail(
        new ValidationError(`Job "${request.jobId}" not found`, "NOT_FOUND"),
      );
    }

    const rawMessages = await this.scriptTweakMessageRepository.findByJobId(
      request.jobId,
    );

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
