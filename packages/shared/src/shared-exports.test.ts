import {
  FEATURED_VOICES,
  FEATURED_VOICE_IDS,
  DEFAULT_VOICE_ID,
} from "./voices/voice-registry.js";
import {
  FORMAT_WORD_RANGES,
  FORMAT_RESOLUTIONS,
} from "./types/format-config.js";
import {
  SCENE_SFX_MAP,
  SFX_AMBIENT_ASSETS,
  SFX_TRANSITION_ASSETS,
  SFX_UTILITY_ASSETS,
  ALL_SFX_ASSETS,
  ALL_SFX_FILENAMES,
} from "./sfx/sfx-library.js";
import { voiceSettingsSchema } from "./schemas/pipeline.schema.js";

describe("Voice Registry", () => {
  it("exports exactly 3 featured voices", () => {
    expect(FEATURED_VOICES).toHaveLength(3);
  });

  it("each featured voice has valid voiceId, name, category, gender, description", () => {
    for (const voice of FEATURED_VOICES) {
      expect(typeof voice.voiceId).toBe("string");
      expect(voice.voiceId.length).toBeGreaterThan(0);
      expect(typeof voice.name).toBe("string");
      expect(voice.name.length).toBeGreaterThan(0);
      expect(["fast-energetic", "natural-human"]).toContain(voice.category);
      expect(["male", "female"]).toContain(voice.gender);
      expect(typeof voice.description).toBe("string");
      expect(voice.description.length).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_VOICE_ID matches the voiceId of the first featured voice", () => {
    expect(DEFAULT_VOICE_ID).toBe(FEATURED_VOICES[0]!.voiceId);
  });

  it("FEATURED_VOICE_IDS contains exactly the voiceIds from FEATURED_VOICES", () => {
    expect(FEATURED_VOICE_IDS.size).toBe(FEATURED_VOICES.length);
    for (const voice of FEATURED_VOICES) {
      expect(FEATURED_VOICE_IDS.has(voice.voiceId)).toBe(true);
    }
  });
});

describe("Format Config", () => {
  const formats = ["reel", "short", "longform"] as const;

  it("FORMAT_WORD_RANGES defines min/max for all three formats where min < max", () => {
    for (const format of formats) {
      const range = FORMAT_WORD_RANGES[format];
      expect(range).toBeDefined();
      expect(typeof range.min).toBe("number");
      expect(typeof range.max).toBe("number");
      expect(range.min).toBeLessThan(range.max);
    }
  });

  it("FORMAT_RESOLUTIONS defines width/height for all three formats with positive integers", () => {
    for (const format of formats) {
      const res = FORMAT_RESOLUTIONS[format];
      expect(res).toBeDefined();
      expect(Number.isInteger(res.width)).toBe(true);
      expect(Number.isInteger(res.height)).toBe(true);
      expect(res.width).toBeGreaterThan(0);
      expect(res.height).toBeGreaterThan(0);
    }
  });
});

describe("SFX Library", () => {
  const sceneTypes = [
    "Hook",
    "Analogy",
    "Bridge",
    "Architecture",
    "Spotlight",
    "Comparison",
    "Power",
    "CTA",
  ] as const;

  it("SCENE_SFX_MAP defines an SfxProfile for all 8 scene types", () => {
    for (const type of sceneTypes) {
      const profile = SCENE_SFX_MAP[type];
      expect(profile).toBeDefined();
      expect(typeof profile.ambience).toBe("string");
      expect(profile.ambience.length).toBeGreaterThan(0);
      expect(typeof profile.transition).toBe("string");
      expect(profile.transition.length).toBeGreaterThan(0);
      expect(typeof profile.ambienceVolume).toBe("number");
      expect(typeof profile.transitionVolume).toBe("number");
    }
  });

  it("ALL_SFX_ASSETS contains all ambient, transition, and utility assets combined", () => {
    const expectedLength =
      SFX_AMBIENT_ASSETS.length +
      SFX_TRANSITION_ASSETS.length +
      SFX_UTILITY_ASSETS.length;
    expect(ALL_SFX_ASSETS).toHaveLength(expectedLength);

    for (const asset of SFX_AMBIENT_ASSETS) {
      expect(ALL_SFX_ASSETS).toContainEqual(asset);
    }
    for (const asset of SFX_TRANSITION_ASSETS) {
      expect(ALL_SFX_ASSETS).toContainEqual(asset);
    }
    for (const asset of SFX_UTILITY_ASSETS) {
      expect(ALL_SFX_ASSETS).toContainEqual(asset);
    }
  });

  it("ALL_SFX_FILENAMES has same length as ALL_SFX_ASSETS and contains only .mp3 filenames", () => {
    expect(ALL_SFX_FILENAMES).toHaveLength(ALL_SFX_ASSETS.length);
    for (const filename of ALL_SFX_FILENAMES) {
      expect(filename).toMatch(/\.mp3$/);
    }
  });
});

describe("voiceSettingsSchema", () => {
  it("parses valid objects with speed, stability, similarityBoost, style within ranges", () => {
    const valid = {
      speed: 1.0,
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.3,
    };
    const result = voiceSettingsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("parses at boundary values", () => {
    const minBoundary = {
      speed: 0.7,
      stability: 0,
      similarityBoost: 0,
      style: 0,
    };
    const maxBoundary = {
      speed: 1.2,
      stability: 1,
      similarityBoost: 1,
      style: 1,
    };
    expect(voiceSettingsSchema.safeParse(minBoundary).success).toBe(true);
    expect(voiceSettingsSchema.safeParse(maxBoundary).success).toBe(true);
  });

  it("rejects speed outside 0.7–1.2 range", () => {
    const tooLow = {
      speed: 0.5,
      stability: 0.5,
      similarityBoost: 0.5,
      style: 0.5,
    };
    const tooHigh = {
      speed: 1.5,
      stability: 0.5,
      similarityBoost: 0.5,
      style: 0.5,
    };
    expect(voiceSettingsSchema.safeParse(tooLow).success).toBe(false);
    expect(voiceSettingsSchema.safeParse(tooHigh).success).toBe(false);
  });
});
