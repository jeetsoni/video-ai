import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";

type Alignment = ElevenLabs.CharacterAlignmentResponseModel;
import type { VoiceSettings, WordTimestamp } from "@video-ai/shared";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { randomUUID } from "node:crypto";

export interface ElevenLabsTTSConfig {
  apiKey: string;
  modelId?: string;
  defaultVoiceId?: string;
  maxRetries?: number;
}

const DEFAULTS = {
  modelId: "eleven_v3",
  defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
  maxRetries: 3,
} as const;

export class ElevenLabsTTSService implements TTSService {
  private readonly client: ElevenLabsClient;
  private readonly modelId: string;
  private readonly defaultVoiceId: string;

  constructor(
    config: ElevenLabsTTSConfig,
    private readonly objectStore: ObjectStore,
  ) {
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
    });
    this.modelId = config.modelId ?? DEFAULTS.modelId;
    this.defaultVoiceId = config.defaultVoiceId ?? DEFAULTS.defaultVoiceId;
  }

  async generateSpeech(params: {
    text: string;
    voiceId: string;
    voiceSettings: VoiceSettings;
  }): Promise<
    Result<
      { audioPath: string; format: "mp3"; timestamps: WordTimestamp[] },
      PipelineError
    >
  > {
    const voiceId = params.voiceId || this.defaultVoiceId;

    let audioBase64: string;
    let alignment: Alignment;
    try {
      const response = await this.client.textToSpeech.convertWithTimestamps(
        voiceId,
        {
          text: params.text,
          modelId: this.modelId,
          voiceSettings: {
            stability: params.voiceSettings.stability,
            similarityBoost: params.voiceSettings.similarityBoost,
            style: params.voiceSettings.style,
            speed: params.voiceSettings.speed,
          },
        },
      );
      audioBase64 = response.audioBase64;
      if (!response.alignment) {
        return Result.fail(
          PipelineError.ttsGenerationFailed("ElevenLabs returned no alignment data"),
        );
      }
      alignment = response.alignment;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown TTS error";
      return Result.fail(
        PipelineError.ttsGenerationFailed(`ElevenLabs TTS failed: ${message}`),
      );
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");

    const audioKey = `audio/${randomUUID()}.mp3`;
    const uploadResult = await this.objectStore.upload({
      key: audioKey,
      data: audioBuffer,
      contentType: "audio/mpeg",
    });

    if (uploadResult.isFailure) {
      return Result.fail(
        PipelineError.ttsGenerationFailed(
          `Failed to store TTS audio: ${uploadResult.getError().message}`,
        ),
      );
    }

    const timestamps = this.alignmentToWordTimestamps(alignment);

    return Result.ok({
      audioPath: uploadResult.getValue(),
      format: "mp3" as const,
      timestamps,
    });
  }

  async generatePreview(params: {
    text: string;
    voiceId: string;
    voiceSettings: VoiceSettings;
  }): Promise<Result<Buffer, PipelineError>> {
    const voiceId = params.voiceId || this.defaultVoiceId;

    try {
      const stream = await this.client.textToSpeech.convert(voiceId, {
        text: params.text,
        modelId: "eleven_flash_v2_5",
        voiceSettings: {
          stability: params.voiceSettings.stability,
          similarityBoost: params.voiceSettings.similarityBoost,
          style: params.voiceSettings.style,
          speed: params.voiceSettings.speed,
        },
      });

      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return Result.ok(Buffer.concat(chunks));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown TTS error";
      return Result.fail(
        PipelineError.ttsGenerationFailed(
          `ElevenLabs TTS preview failed: ${message}`,
        ),
      );
    }
  }

  private alignmentToWordTimestamps(
    alignment: Alignment,
  ): WordTimestamp[] {
    const {
      characters,
      characterStartTimesSeconds,
      characterEndTimesSeconds,
    } = alignment;
    const words: WordTimestamp[] = [];

    let wordStart = -1;
    let wordChars: string[] = [];

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i]!;
      const isSpace = char === " " || char === "\n" || char === "\t";

      if (isSpace) {
        if (wordChars.length > 0) {
          words.push({
            word: wordChars.join(""),
            start: wordStart,
            end: characterEndTimesSeconds[i - 1]!,
          });
          wordChars = [];
          wordStart = -1;
        }
      } else {
        if (wordStart < 0) {
          wordStart = characterStartTimesSeconds[i]!;
        }
        wordChars.push(char);
      }
    }

    if (wordChars.length > 0 && wordStart >= 0) {
      words.push({
        word: wordChars.join(""),
        start: wordStart,
        end: characterEndTimesSeconds[characters.length - 1]!,
      });
    }

    return words;
  }
}
