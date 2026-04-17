import type { WordTimestamp } from "@video-ai/shared";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { randomUUID } from "node:crypto";

export interface ElevenLabsTTSConfig {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  defaultVoiceId: string;
  maxRetries: number;
  baseDelayMs: number;
}

const DEFAULT_CONFIG: Omit<ElevenLabsTTSConfig, "apiKey"> = {
  baseUrl: "https://api.elevenlabs.io/v1",
  modelId: "eleven_multilingual_v2",
  defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
  maxRetries: 3,
  baseDelayMs: 1000,
};

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export class ElevenLabsTTSService implements TTSService {
  private readonly config: ElevenLabsTTSConfig;

  constructor(
    config: Pick<ElevenLabsTTSConfig, "apiKey"> &
      Partial<Omit<ElevenLabsTTSConfig, "apiKey">>,
    private readonly objectStore: ObjectStore,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateSpeech(params: {
    text: string;
    voiceId: string;
  }): Promise<Result<{ audioPath: string; format: "mp3"; timestamps: WordTimestamp[] }, PipelineError>> {
    const voiceId = params.voiceId || this.config.defaultVoiceId;
    const url = `${this.config.baseUrl}/text-to-speech/${voiceId}/with-timestamps`;

    let response: ElevenLabsTimestampResponse;
    try {
      response = await this.callWithRetry(url, params.text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown TTS error";
      return Result.fail(
        PipelineError.ttsGenerationFailed(
          `ElevenLabs TTS failed after ${this.config.maxRetries} attempts: ${message}`,
        ),
      );
    }

    // Decode audio from base64
    const audioBuffer = Buffer.from(response.audio_base64, "base64");

    // Upload audio to object store
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

    // Convert character-level alignment to word-level timestamps
    const timestamps = this.alignmentToWordTimestamps(
      response.alignment,
      params.text,
    );

    return Result.ok({
      audioPath: uploadResult.getValue(),
      format: "mp3" as const,
      timestamps,
    });
  }

  private alignmentToWordTimestamps(
    alignment: ElevenLabsTimestampResponse["alignment"],
    originalText: string,
  ): WordTimestamp[] {
    const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
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
            end: character_end_times_seconds[i - 1]!,
          });
          wordChars = [];
          wordStart = -1;
        }
      } else {
        if (wordStart < 0) {
          wordStart = character_start_times_seconds[i]!;
        }
        wordChars.push(char);
      }
    }

    // Flush last word
    if (wordChars.length > 0 && wordStart >= 0) {
      words.push({
        word: wordChars.join(""),
        start: wordStart,
        end: character_end_times_seconds[characters.length - 1]!,
      });
    }

    return words;
  }

  private async callWithRetry(url: string, text: string): Promise<ElevenLabsTimestampResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.callElevenLabsAPI(url, text);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries) {
          const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private async callElevenLabsAPI(url: string, text: string): Promise<ElevenLabsTimestampResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.config.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: this.config.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs API error ${response.status}: ${body || response.statusText}`,
      );
    }

    return response.json() as Promise<ElevenLabsTimestampResponse>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
