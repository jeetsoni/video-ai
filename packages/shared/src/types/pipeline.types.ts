import type { VoiceSettings } from "./voice-settings.types.js";

export type VideoFormat = "reel" | "short" | "longform";

export type PipelineStatus =
  | "pending"
  | "processing"
  | "awaiting_script_review"
  | "completed"
  | "failed";

export type PipelineStage =
  | "script_generation"
  | "script_review"
  | "tts_generation"
  | "transcription"
  | "timestamp_mapping"
  | "direction_generation"
  | "code_generation"
  | "preview"
  | "rendering"
  | "done";

export type PipelineErrorCode =
  | "script_generation_failed"
  | "tts_generation_failed"
  | "transcription_failed"
  | "timestamp_mapping_failed"
  | "direction_generation_failed"
  | "code_generation_failed"
  | "rendering_failed";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SceneBoundary {
  id: number;
  name: string;
  type:
    | "Hook"
    | "Analogy"
    | "Bridge"
    | "Architecture"
    | "Spotlight"
    | "Comparison"
    | "Power"
    | "CTA";
  startTime: number;
  endTime: number;
  text: string;
}

export interface SceneBeat {
  id: string;
  timeRange: [number, number];
  frameRange: [number, number];
  spokenText: string;
  visual: string;
  typography: string;
  motion: string;
  sfx?: string[];
  slot?: string;
}

export interface SceneDirection {
  id: number;
  name: string;
  type: SceneBoundary["type"];
  description: string;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  text: string;
  words: WordTimestamp[];
  animationDirection: {
    colorAccent: string;
    mood: string;
    layout: string;
    beats: SceneBeat[];
  };
}

export interface AnimationTheme {
  id: string;
  name: string;
  description?: string;
  background: string;
  surface: string;
  raised: string;
  textPrimary: string;
  textMuted: string;
  accents: {
    hookFear: string;
    wrongPath: string;
    techCode: string;
    revelation: string;
    cta: string;
    violet: string;
  };
}

export interface ScenePlan {
  title: string;
  totalDuration: number;
  fps: 30;
  totalFrames: number;
  designSystem: {
    background: string;
    surface: string;
    raised: string;
    textPrimary: string;
    textMuted: string;
    accents: AnimationTheme["accents"];
  };
  scenes: SceneDirection[];
}

export interface PipelineJobDto {
  id: string;
  topic: string;
  format: VideoFormat;
  themeId: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings;
  status: PipelineStatus;
  stage: PipelineStage;
  progressPercent: number;
  errorCode?: string;
  errorMessage?: string;
  generatedScript?: string;
  approvedScript?: string;
  generatedScenes?: SceneBoundary[];
  approvedScenes?: SceneBoundary[];
  scenePlan?: SceneBoundary[];
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
}
