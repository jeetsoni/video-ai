export interface FeaturedVoice {
  voiceId: string;
  name: string;
  category: "fast-energetic" | "natural-human";
  gender: "male" | "female";
  description: string;
}

export const FEATURED_VOICES: readonly FeaturedVoice[] = [
  {
    voiceId: "bIHbv24MWmeRgasZH58o",
    name: "Will — Relaxed Optimist",
    category: "natural-human",
    gender: "male",
    description: "Warm, conversational, naturally optimistic",
  },
  {
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah — Mature",
    category: "natural-human",
    gender: "female",
    description: "Confident, polished, mature tone",
  },
  {
    voiceId: "uxKr2vlA4hYgXZR1oPRT",
    name: "Natasha — Valley Girl",
    category: "fast-energetic",
    gender: "female",
    description: "Energetic, attention-grabbing, fast-paced",
  },
  {
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    category: "natural-human",
    gender: "male",
    description: "Clear, authoritative, documentary style",
  },
  {
    voiceId: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    category: "natural-human",
    gender: "male",
    description: "Deep, warm, emotionally resonant",
  },
] as const;

export const FEATURED_VOICE_IDS = new Set(
  FEATURED_VOICES.map((v) => v.voiceId),
);

export const DEFAULT_VOICE_ID = "bIHbv24MWmeRgasZH58o";
