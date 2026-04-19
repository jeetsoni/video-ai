import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import {
  FEATURED_VOICES,
  FEATURED_VOICE_IDS,
  type VoiceEntry,
} from "@video-ai/shared";
import type { VoiceService } from "@/pipeline/application/interfaces/voice-service.js";
import { Result } from "@/shared/domain/result.js";

export function mapSdkVoiceToEntry(voice: ElevenLabs.Voice): VoiceEntry {
  const isFeatured = FEATURED_VOICE_IDS.has(voice.voiceId);
  const featuredInfo = isFeatured
    ? FEATURED_VOICES.find((fv) => fv.voiceId === voice.voiceId)
    : undefined;

  return {
    voiceId: voice.voiceId,
    name: voice.name ?? voice.voiceId,
    description: featuredInfo?.description ?? voice.description ?? "",
    previewUrl: voice.previewUrl ?? null,
    gender: resolveGender(voice.labels),
    featured: isFeatured,
    category: featuredInfo?.category ?? null,
  };
}

function resolveGender(
  labels?: Record<string, string>,
): "male" | "female" | "unknown" {
  const value = labels?.["gender"]?.toLowerCase();
  if (value === "male") return "male";
  if (value === "female") return "female";
  return "unknown";
}

export function sortVoices(voices: VoiceEntry[]): VoiceEntry[] {
  const featuredOrder = Array.from(FEATURED_VOICE_IDS);

  return [...voices].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;

    if (a.featured && b.featured) {
      return (
        featuredOrder.indexOf(a.voiceId) - featuredOrder.indexOf(b.voiceId)
      );
    }

    return a.name.localeCompare(b.name);
  });
}

function buildFallbackVoices(): VoiceEntry[] {
  return FEATURED_VOICES.map((fv) => ({
    voiceId: fv.voiceId,
    name: fv.name,
    description: fv.description,
    previewUrl: null,
    gender: fv.gender,
    featured: true,
    category: fv.category,
  }));
}

export class ElevenLabsVoiceService implements VoiceService {
  private readonly client: ElevenLabsClient;

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  async listVoices(): Promise<Result<VoiceEntry[], Error>> {
    try {
      const response = await this.client.voices.getAll();
      const entries = (response.voices ?? []).map(mapSdkVoiceToEntry);
      return Result.ok(sortVoices(entries));
    } catch {
      return Result.ok(buildFallbackVoices());
    }
  }
}
