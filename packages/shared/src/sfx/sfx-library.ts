import type { SceneBoundary } from "../types/pipeline.types.js";

export type SceneType = SceneBoundary["type"];

export interface SfxProfile {
  /** Loopable ambient bed filename */
  ambience: string;
  /** Transition sound filename played at scene entry */
  transition: string;
  /** Ambient volume (0–1). Keep low so it sits under the voiceover. */
  ambienceVolume: number;
  /** Transition volume (0–1). Brief hit, can be slightly louder. */
  transitionVolume: number;
}

export const SCENE_SFX_MAP: Record<SceneType, SfxProfile> = {
  Hook: {
    ambience: "ambience-hook.mp3",
    transition: "whoosh-forward.mp3",
    ambienceVolume: 0.06,
    transitionVolume: 0.18,
  },
  Analogy: {
    ambience: "ambience-analogy.mp3",
    transition: "whoosh-soft.mp3",
    ambienceVolume: 0.05,
    transitionVolume: 0.14,
  },
  Bridge: {
    ambience: "ambience-bridge.mp3",
    transition: "whoosh-soft.mp3",
    ambienceVolume: 0.04,
    transitionVolume: 0.12,
  },
  Architecture: {
    ambience: "ambience-architecture.mp3",
    transition: "whoosh-digital.mp3",
    ambienceVolume: 0.06,
    transitionVolume: 0.16,
  },
  Spotlight: {
    ambience: "ambience-spotlight.mp3",
    transition: "pop-reveal.mp3",
    ambienceVolume: 0.05,
    transitionVolume: 0.16,
  },
  Comparison: {
    ambience: "ambience-comparison.mp3",
    transition: "rise-build.mp3",
    ambienceVolume: 0.05,
    transitionVolume: 0.15,
  },
  Power: {
    ambience: "ambience-power.mp3",
    transition: "rise-build.mp3",
    ambienceVolume: 0.06,
    transitionVolume: 0.16,
  },
  CTA: {
    ambience: "ambience-cta.mp3",
    transition: "resolve-warm.mp3",
    ambienceVolume: 0.05,
    transitionVolume: 0.18,
  },
};

export interface SfxAssetDefinition {
  name: string;
  filename: string;
  prompt: string;
  durationSeconds: number;
  promptInfluence: number;
}

export const SFX_AMBIENT_ASSETS: SfxAssetDefinition[] = [
  {
    name: "Hook Ambience",
    filename: "ambience-hook.mp3",
    prompt:
      "Curious upbeat ambient pad with gentle plucked texture and light forward momentum, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "Analogy Ambience",
    filename: "ambience-analogy.mp3",
    prompt:
      "Warm friendly ambient pad with soft piano-like texture and gentle evolving tone, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "Bridge Ambience",
    filename: "ambience-bridge.mp3",
    prompt:
      "Minimal clean ambient hum with soft air and subtle neutral tone, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "Architecture Ambience",
    filename: "ambience-architecture.mp3",
    prompt:
      "Calm soft ambient pad with gentle warm tone and very subtle airy texture, clean and minimal, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.3,
  },
  {
    name: "Spotlight Ambience",
    filename: "ambience-spotlight.mp3",
    prompt:
      "Focused bright ambient tone with gentle clarity and clean high-end shimmer, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "Comparison Ambience",
    filename: "ambience-comparison.mp3",
    prompt:
      "Balanced neutral ambient bed with subtle alternating stereo movement and clean tone, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "Power Ambience",
    filename: "ambience-power.mp3",
    prompt:
      "Confident steady ambient pad with warm building undertone and modern clean texture, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
  {
    name: "CTA Ambience",
    filename: "ambience-cta.mp3",
    prompt:
      "Uplifting warm ambient resolution with gentle positive shimmer and soft fade, seamless loop",
    durationSeconds: 10,
    promptInfluence: 0.5,
  },
];

export const SFX_TRANSITION_ASSETS: SfxAssetDefinition[] = [
  {
    name: "Forward Whoosh",
    filename: "whoosh-forward.mp3",
    prompt:
      "Clean quick forward swoosh with light modern texture and short tail",
    durationSeconds: 1.5,
    promptInfluence: 0.7,
  },
  {
    name: "Soft Whoosh",
    filename: "whoosh-soft.mp3",
    prompt: "Soft gentle transition swoosh with airy movement and quick fade",
    durationSeconds: 1,
    promptInfluence: 0.7,
  },
  {
    name: "Digital Whoosh",
    filename: "whoosh-digital.mp3",
    prompt:
      "Quick digital transition blip with clean electronic texture and short decay",
    durationSeconds: 1.5,
    promptInfluence: 0.7,
  },
  {
    name: "Pop Reveal",
    filename: "pop-reveal.mp3",
    prompt: "Bright clean pop with subtle sparkle and quick decay",
    durationSeconds: 1,
    promptInfluence: 0.7,
  },
  {
    name: "Rise Build",
    filename: "rise-build.mp3",
    prompt:
      "Short rising tone building to a clean bright peak with quick resolve",
    durationSeconds: 2,
    promptInfluence: 0.7,
  },
  {
    name: "Warm Resolve",
    filename: "resolve-warm.mp3",
    prompt:
      "Warm confident resolve tone with gentle positive character and clean ending",
    durationSeconds: 1.5,
    promptInfluence: 0.7,
  },
];

export const SFX_UTILITY_ASSETS: SfxAssetDefinition[] = [
  {
    name: "Text Pop",
    filename: "text-pop.mp3",
    prompt:
      "Short subtle pop for text appearing on screen with clean digital character",
    durationSeconds: 0.5,
    promptInfluence: 0.7,
  },
  {
    name: "Slide In",
    filename: "slide-in.mp3",
    prompt:
      "Quick smooth slide sound with soft material movement and clean stop",
    durationSeconds: 0.8,
    promptInfluence: 0.7,
  },
  {
    name: "Success Ding",
    filename: "success-ding.mp3",
    prompt: "Short friendly notification ding with bright clean tone",
    durationSeconds: 1,
    promptInfluence: 0.7,
  },
  {
    name: "Scene Fade",
    filename: "scene-fade.mp3",
    prompt:
      "Gentle soft ambient fade dissolving to silence with warm reverb tail",
    durationSeconds: 2,
    promptInfluence: 0.7,
  },
];

export const ALL_SFX_ASSETS: SfxAssetDefinition[] = [
  ...SFX_AMBIENT_ASSETS,
  ...SFX_TRANSITION_ASSETS,
  ...SFX_UTILITY_ASSETS,
];

/** All SFX filenames for easy iteration */
export const ALL_SFX_FILENAMES: string[] = ALL_SFX_ASSETS.map(
  (a) => a.filename,
);
