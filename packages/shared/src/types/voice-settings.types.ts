export interface VoiceSettings {
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
}

export interface VoiceSettingRange {
  min: number;
  max: number;
  step: number;
  default: number;
}

export const VOICE_SETTINGS_RANGES: Record<
  keyof VoiceSettings,
  VoiceSettingRange
> = {
  speed: { min: 0.7, max: 1.2, step: 0.1, default: 1.0 },
  stability: { min: 0.0, max: 1.0, step: 0.05, default: 0.5 },
  similarityBoost: { min: 0.0, max: 1.0, step: 0.05, default: 0.75 },
  style: { min: 0.0, max: 1.0, step: 0.05, default: 0.0 },
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  speed: 1.0,
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
};
