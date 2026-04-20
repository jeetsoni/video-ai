import { z } from "zod";

export const voiceSettingsSchema = z.object({
  speed: z.number().min(0.7).max(1.2),
  stability: z.number().min(0).max(1),
  similarityBoost: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
});

export const createPipelineJobSchema = z.object({
  topic: z.string().min(3).max(500),
  format: z.enum(["reel", "short", "longform"]),
  themeId: z.string().min(1),
  voiceId: z.string().min(1).optional(),
  voiceSettings: voiceSettingsSchema.optional(),
});

/** Schema for the scene block within a structured script (no timestamps yet) */
export const sceneBlockSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum([
    "Hook",
    "Analogy",
    "Bridge",
    "Architecture",
    "Spotlight",
    "Comparison",
    "Power",
    "CTA",
  ]),
  text: z.string().min(1),
});

export const approveScriptSchema = z.object({
  script: z.string().optional(),
  scenes: z.array(sceneBlockSchema).optional(),
  voiceId: z.string().min(1).optional(),
  voiceSettings: voiceSettingsSchema.optional(),
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
  type: z.enum([
    "Hook",
    "Analogy",
    "Bridge",
    "Architecture",
    "Spotlight",
    "Comparison",
    "Power",
    "CTA",
  ]),
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

/** Schema for the structured script generation output (script + scene blocks) */
export const structuredScriptResponseSchema = z.object({
  script: z.string().min(1),
  scenes: z.array(sceneBlockSchema).min(2).max(15),
});

/** Schema for voice preview request validation */
export const voicePreviewSchema = z.object({
  voiceId: z.string().optional(),
  voiceSettings: voiceSettingsSchema,
  text: z.string().min(1).max(500).optional(),
});
