import type { z } from "zod";
import type { createPipelineJobSchema } from "@video-ai/shared";

export type CreateJobRequest = z.infer<typeof createPipelineJobSchema>;

export interface CreateJobResponse {
  jobId: string;
  status: string;
}
