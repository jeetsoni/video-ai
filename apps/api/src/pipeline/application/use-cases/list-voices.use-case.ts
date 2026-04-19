import type { ListVoicesResponse } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import { Result } from "@/shared/domain/result.js";
import type { VoiceService } from "@/pipeline/application/interfaces/voice-service.js";

export class ListVoicesUseCase implements UseCase<
  void,
  Result<ListVoicesResponse, Error>
> {
  constructor(private readonly voiceService: VoiceService) {}

  async execute(): Promise<Result<ListVoicesResponse, Error>> {
    const result = await this.voiceService.listVoices();
    if (result.isFailure) {
      return Result.fail(result.getError());
    }
    return Result.ok({ voices: result.getValue() });
  }
}
