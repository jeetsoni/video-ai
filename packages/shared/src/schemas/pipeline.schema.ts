import { z } from "zod";

export const createPipelineJobSchema = z.object({
  topic: z.string().min(3).max(500),
  format: z.enum(["reel", "short", "longform"]),
  themeId: z.string().min(1),
});

export const approveScriptSchema = z.object({
  script: z.string().optional(),
  action: z.literal("approve"),
});

export const wordTimestampSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const sceneBoundarySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(["Hook", "Analogy", "Bridge", "Architecture", "Spotlight", "Comparison", "Power", "CTA"]),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  text: z.string(),
});

export const sceneBoundariesResponseSchema = z.object({
  title: z.string(),
  totalDuration: z.number().positive(),
  fps: z.literal(30),
  boundaries: z.array(sceneBoundarySchema).min(2).max(15),
});
