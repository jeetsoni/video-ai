import type { z } from "zod";
import type { approveScriptSchema } from "@video-ai/shared";

export type ApproveScriptRequest = z.infer<typeof approveScriptSchema>;
