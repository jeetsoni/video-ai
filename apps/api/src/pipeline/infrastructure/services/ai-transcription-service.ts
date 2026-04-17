import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { WordTimestamp } from "@video-ai/shared";
import type { TranscriptionService } from "@/pipeline/application/interfaces/transcription-service.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AITranscriptionServiceConfig {
  model: string;
}

const DEFAULT_CONFIG: AITranscriptionServiceConfig = {
  model: "gpt-4o-mini",
};

const TRANSCRIPTION_SYSTEM_PROMPT = [
  "You are a precise audio transcription engine.",
  "Given the text content of an audio narration, produce word-level timestamps.",
  "Output a JSON array where each element has: word (string), start (number in seconds), end (number in seconds).",
  "Timestamps must be sequential with no gaps between consecutive words.",
  "Precision must be at least 10 milliseconds.",
  "Output ONLY the JSON array, no other text.",
].join("\n");

export class AITranscriptionService implements TranscriptionService {
  private readonly config: AITranscriptionServiceConfig;
  private readonly objectStore: ObjectStore;

  constructor(objectStore: ObjectStore, config?: Partial<AITranscriptionServiceConfig>) {
    this.objectStore = objectStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async transcribe(params: {
    audioPath: string;
    scriptText: string;
  }): Promise<Result<WordTimestamp[], PipelineError>> {
    try {
      const { text } = await generateText({
        model: openai(this.config.model),
        system: TRANSCRIPTION_SYSTEM_PROMPT,
        prompt: `Generate word-level timestamps for the following narration script. Assume a natural speaking pace of about 2.5 words per second:\n\n${params.scriptText}`,
        temperature: 0,
      });

      if (!text || text.trim().length === 0) {
        return Result.fail(
          PipelineError.transcriptionFailed("Transcription returned empty output")
        );
      }

      const timestamps = parseTimestamps(text);
      if (!timestamps) {
        return Result.fail(
          PipelineError.transcriptionFailed("Failed to parse transcription output as WordTimestamp[]")
        );
      }

      if (timestamps.length === 0) {
        return Result.fail(
          PipelineError.transcriptionFailed("Transcription produced zero words")
        );
      }

      return Result.ok(timestamps);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown transcription error";
      return Result.fail(
        PipelineError.transcriptionFailed(`Transcription failed: ${message}`)
      );
    }
  }
}

function parseTimestamps(raw: string): WordTimestamp[] | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return null;

    for (const item of parsed) {
      if (
        typeof item.word !== "string" ||
        typeof item.start !== "number" ||
        typeof item.end !== "number" ||
        item.start < 0 ||
        item.end < item.start
      ) {
        return null;
      }
    }

    return parsed as WordTimestamp[];
  } catch {
    return null;
  }
}
