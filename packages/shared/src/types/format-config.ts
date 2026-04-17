import type { VideoFormat } from "./pipeline.types";

export const FORMAT_WORD_RANGES: Record<VideoFormat, { min: number; max: number }> = {
  reel: { min: 50, max: 150 },
  short: { min: 50, max: 150 },
  longform: { min: 300, max: 2000 },
};

export const FORMAT_RESOLUTIONS: Record<VideoFormat, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 },
  short: { width: 1080, height: 1920 },
  longform: { width: 1920, height: 1080 },
};
