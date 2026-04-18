import { Queue, type ConnectionOptions } from "bullmq";
import type { PipelineStage } from "@video-ai/shared";

export const PIPELINE_QUEUE_NAME = "pipeline";

type ProcessingStage = Exclude<
  PipelineStage,
  "script_review" | "done"
>;

export const STAGE_RETRY_CONFIG: Record<
  ProcessingStage,
  { attempts: number; backoff: { type: "exponential"; delay: number } }
> = {
  script_generation: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  tts_generation: { attempts: 3, backoff: { type: "exponential", delay: 3000 } },
  transcription: { attempts: 1, backoff: { type: "exponential", delay: 1000 } },
  timestamp_mapping: { attempts: 1, backoff: { type: "exponential", delay: 1000 } },
  direction_generation: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
  code_generation: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
  rendering: { attempts: 1, backoff: { type: "exponential", delay: 1000 } },
};

const NON_PROCESSING_STAGES: ReadonlySet<string> = new Set([
  "script_review",
  "done",
]);

export function isProcessingStage(stage: PipelineStage): stage is ProcessingStage {
  return !NON_PROCESSING_STAGES.has(stage);
}

export function createPipelineQueue(connection: ConnectionOptions): Queue {
  return new Queue(PIPELINE_QUEUE_NAME, { connection });
}
