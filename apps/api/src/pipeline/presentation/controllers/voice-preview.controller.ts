import type { Request, Response } from "express";
import { voicePreviewSchema } from "@video-ai/shared";
import type { GenerateVoicePreviewUseCase } from "@/pipeline/application/use-cases/generate-voice-preview.use-case.js";

export class VoicePreviewController {
  constructor(private readonly generateVoicePreviewUseCase: GenerateVoicePreviewUseCase) {}

  async handlePreview(req: Request, res: Response): Promise<void> {
    const parsed = voicePreviewSchema.safeParse(req.body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid input";
      res.status(400).json({ error: "INVALID_INPUT", message });
      return;
    }

    const result = await this.generateVoicePreviewUseCase.execute({
      voiceId: parsed.data.voiceId,
      voiceSettings: parsed.data.voiceSettings,
      text: parsed.data.text,
    });

    if (result.isFailure) {
      res.status(502).json({
        error: "tts_generation_failed",
        message: result.getError().message,
      });
      return;
    }

    res.set("Content-Type", "audio/mpeg");
    res.send(result.getValue());
  }
}
