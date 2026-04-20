import type { VoiceSettings } from "@video-ai/shared";
import type { UseCase } from "@/shared/domain/use-case.js";
import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";

export const SAMPLE_TEXT =
  "Here is a preview of how your voice settings will sound in the final video.";

export class GenerateVoicePreviewUseCase
  implements UseCase<{ voiceId?: string; voiceSettings: VoiceSettings; text?: string }, Result<Buffer, PipelineError>>
{
  constructor(private readonly ttsService: TTSService) {}

  async execute(request: {
    voiceId?: string;
    voiceSettings: VoiceSettings;
    text?: string;
  }): Promise<Result<Buffer, PipelineError>> {
    return this.ttsService.generatePreview({
      text: request.text || SAMPLE_TEXT,
      voiceId: request.voiceId ?? "",
      voiceSettings: request.voiceSettings,
    });
  }
}
