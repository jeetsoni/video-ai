import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { FEATURED_VOICE_IDS, FEATURED_VOICES } from "@video-ai/shared";
import {
  mapSdkVoiceToEntry,
  sortVoices,
  ElevenLabsVoiceService,
} from "./elevenlabs-voice-service.js";
import type { VoiceEntry } from "@video-ai/shared";

function makeSdkVoice(
  overrides: Partial<ElevenLabs.Voice> = {},
): ElevenLabs.Voice {
  return {
    voiceId: "test-voice-id",
    name: "Test Voice",
    description: "A test voice",
    previewUrl: "https://example.com/preview.mp3",
    labels: { gender: "female" },
    ...overrides,
  };
}

describe("mapSdkVoiceToEntry", () => {
  it("maps a non-featured voice correctly", () => {
    const sdkVoice = makeSdkVoice({
      voiceId: "non-featured-id",
      name: "Random Voice",
      description: "Some description",
      previewUrl: "https://example.com/audio.mp3",
      labels: { gender: "male" },
    });

    const entry = mapSdkVoiceToEntry(sdkVoice);

    expect(entry).toEqual({
      voiceId: "non-featured-id",
      name: "Random Voice",
      description: "Some description",
      previewUrl: "https://example.com/audio.mp3",
      gender: "male",
      featured: false,
      category: null,
    });
  });

  it("maps a featured voice with registry metadata", () => {
    const featured = FEATURED_VOICES[0]!;
    const sdkVoice = makeSdkVoice({
      voiceId: featured.voiceId,
      name: featured.name,
      description: "SDK description",
      previewUrl: "https://example.com/preview.mp3",
      labels: { gender: "female" },
    });

    const entry = mapSdkVoiceToEntry(sdkVoice);

    expect(entry.featured).toBe(true);
    expect(entry.category).toBe(featured.category);
    expect(entry.description).toBe(featured.description);
  });

  it("uses voiceId as name when name is missing", () => {
    const sdkVoice = makeSdkVoice({ name: undefined });
    const entry = mapSdkVoiceToEntry(sdkVoice);
    expect(entry.name).toBe(sdkVoice.voiceId);
  });

  it("sets previewUrl to null when missing", () => {
    const sdkVoice = makeSdkVoice({ previewUrl: undefined });
    const entry = mapSdkVoiceToEntry(sdkVoice);
    expect(entry.previewUrl).toBeNull();
  });

  it("resolves gender as unknown when labels missing", () => {
    const sdkVoice = makeSdkVoice({ labels: undefined });
    const entry = mapSdkVoiceToEntry(sdkVoice);
    expect(entry.gender).toBe("unknown");
  });

  it("resolves gender as unknown for unrecognized values", () => {
    const sdkVoice = makeSdkVoice({ labels: { gender: "nonbinary" } });
    const entry = mapSdkVoiceToEntry(sdkVoice);
    expect(entry.gender).toBe("unknown");
  });
});

describe("sortVoices", () => {
  it("places featured voices before non-featured", () => {
    const featuredId = Array.from(FEATURED_VOICE_IDS)[0]!;
    const voices: VoiceEntry[] = [
      {
        voiceId: "z-non-featured",
        name: "Zara",
        description: "",
        previewUrl: null,
        gender: "female",
        featured: false,
        category: null,
      },
      {
        voiceId: featuredId,
        name: "Featured",
        description: "",
        previewUrl: null,
        gender: "male",
        featured: true,
        category: "fast-energetic",
      },
    ];

    const sorted = sortVoices(voices);

    expect(sorted[0]!.voiceId).toBe(featuredId);
    expect(sorted[1]!.voiceId).toBe("z-non-featured");
  });

  it("sorts featured voices in registry order", () => {
    const ids = Array.from(FEATURED_VOICE_IDS);
    const voices: VoiceEntry[] = ids.reverse().map((id) => ({
      voiceId: id,
      name: id,
      description: "",
      previewUrl: null,
      gender: "unknown" as const,
      featured: true,
      category: null,
    }));

    const sorted = sortVoices(voices);
    const sortedIds = sorted.map((v) => v.voiceId);
    const expectedOrder = Array.from(FEATURED_VOICE_IDS);

    expect(sortedIds).toEqual(expectedOrder);
  });

  it("sorts non-featured voices alphabetically by name", () => {
    const voices: VoiceEntry[] = [
      {
        voiceId: "c",
        name: "Charlie",
        description: "",
        previewUrl: null,
        gender: "male",
        featured: false,
        category: null,
      },
      {
        voiceId: "a",
        name: "Alice",
        description: "",
        previewUrl: null,
        gender: "female",
        featured: false,
        category: null,
      },
      {
        voiceId: "b",
        name: "Bob",
        description: "",
        previewUrl: null,
        gender: "male",
        featured: false,
        category: null,
      },
    ];

    const sorted = sortVoices(voices);

    expect(sorted.map((v) => v.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });
});

describe("ElevenLabsVoiceService", () => {
  it("returns fallback voices when SDK call fails", async () => {
    const service = new ElevenLabsVoiceService("invalid-api-key");

    // The SDK will fail with an invalid key, triggering the fallback
    const result = await service.listVoices();

    expect(result.isSuccess).toBe(true);
    const voices = result.getValue();
    expect(voices.length).toBe(FEATURED_VOICES.length);
    voices.forEach((v) => {
      expect(v.featured).toBe(true);
      expect(v.previewUrl).toBeNull();
    });
  });
});
