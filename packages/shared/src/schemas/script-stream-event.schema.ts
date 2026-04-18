import { z } from "zod";
import { sceneBlockSchema } from "./pipeline.schema.js";

export const chunkEventSchema = z.object({
  type: z.literal("chunk"),
  seq: z.number().int().nonnegative(),
  data: z.object({ text: z.string() }),
});

export const sceneEventSchema = z.object({
  type: z.literal("scene"),
  seq: z.number().int().nonnegative(),
  data: sceneBlockSchema,
});

export const doneEventSchema = z.object({
  type: z.literal("done"),
  seq: z.number().int().nonnegative(),
  data: z.object({
    script: z.string(),
    scenes: z.array(sceneBlockSchema),
  }),
});

export const errorEventSchema = z.object({
  type: z.literal("error"),
  seq: z.number().int().nonnegative(),
  data: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const scriptStreamEventSchema = z.discriminatedUnion("type", [
  chunkEventSchema,
  sceneEventSchema,
  doneEventSchema,
  errorEventSchema,
]);

export type ScriptStreamEvent = z.infer<typeof scriptStreamEventSchema>;
export type ChunkEvent = z.infer<typeof chunkEventSchema>;
export type SceneEvent = z.infer<typeof sceneEventSchema>;
export type DoneEvent = z.infer<typeof doneEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
