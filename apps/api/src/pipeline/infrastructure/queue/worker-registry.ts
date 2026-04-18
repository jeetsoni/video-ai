import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { PrismaPipelineJobRepository } from "@/pipeline/infrastructure/repositories/prisma-pipeline-job.repository.js";
import { BullMQQueueService } from "@/pipeline/infrastructure/queue/queue-service.js";
import { PIPELINE_QUEUE_NAME } from "@/pipeline/infrastructure/queue/pipeline-queue.js";

// Service adapters
import { AIStreamingScriptGenerator } from "@/pipeline/infrastructure/services/ai-streaming-script-generator.js";
import { RedisStreamEventPublisher } from "@/shared/infrastructure/streaming/stream-event-publisher.js";
import { ElevenLabsTTSService } from "@/pipeline/infrastructure/services/elevenlabs-tts-service.js";
import { AITranscriptionService } from "@/pipeline/infrastructure/services/ai-transcription-service.js";
import { TextTimestampMapper } from "@/pipeline/infrastructure/services/text-timestamp-mapper.js";
import { AIDirectionGenerator } from "@/pipeline/infrastructure/services/ai-direction-generator.js";
import { AICodeGenerator } from "@/pipeline/infrastructure/services/ai-code-generator.js";
import { BoundingBoxValidator } from "@/pipeline/infrastructure/services/layout-validator.js";
import { RemotionVideoRenderer } from "@/pipeline/infrastructure/services/remotion-video-renderer.js";

// Workers
import { ScriptGenerationWorker } from "@/pipeline/infrastructure/queue/workers/script-generation.worker.js";
import { TTSGenerationWorker } from "@/pipeline/infrastructure/queue/workers/tts-generation.worker.js";
import { TranscriptionWorker } from "@/pipeline/infrastructure/queue/workers/transcription.worker.js";
import { TimestampMappingWorker } from "@/pipeline/infrastructure/queue/workers/timestamp-mapping.worker.js";
import { DirectionGenerationWorker } from "@/pipeline/infrastructure/queue/workers/direction-generation.worker.js";
import { CodeGenerationWorker } from "@/pipeline/infrastructure/queue/workers/code-generation.worker.js";
import { VideoRenderingWorker } from "@/pipeline/infrastructure/queue/workers/video-rendering.worker.js";

export interface WorkerRegistryConfig {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
  connection: ConnectionOptions;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
}

export interface WorkerRegistry {
  close(): Promise<void>;
}

export function createWorkerRegistry(config: WorkerRegistryConfig): WorkerRegistry {
  const { prisma, queue, objectStore, connection, elevenLabsApiKey, elevenLabsVoiceId } = config;

  // Shared infrastructure
  const jobRepository = new PrismaPipelineJobRepository(prisma);
  const queueService = new BullMQQueueService(queue);

  // Service adapters
  const streamingScriptGenerator = new AIStreamingScriptGenerator();
  const redisClient = new Redis({ host: (connection as { host?: string }).host ?? "localhost", port: (connection as { port?: number }).port ?? 6379 });
  const eventPublisher = new RedisStreamEventPublisher(redisClient);
  const ttsService = new ElevenLabsTTSService({ apiKey: elevenLabsApiKey }, objectStore);
  const transcriptionService = new AITranscriptionService(objectStore);
  const timestampMapper = new TextTimestampMapper();
  const directionGenerator = new AIDirectionGenerator();
  const codeGenerator = new AICodeGenerator();
  const videoRenderer = new RemotionVideoRenderer(objectStore);

  // Pipeline workers (application-level handlers)
  const scriptGenerationWorker = new ScriptGenerationWorker(streamingScriptGenerator, eventPublisher, jobRepository);
  const ttsGenerationWorker = new TTSGenerationWorker(ttsService, jobRepository, queueService, elevenLabsVoiceId);
  const transcriptionWorker = new TranscriptionWorker(transcriptionService, jobRepository, queueService);
  const timestampMappingWorker = new TimestampMappingWorker(timestampMapper, jobRepository, queueService);
  const directionGenerationWorker = new DirectionGenerationWorker(directionGenerator, jobRepository, queueService);
  const layoutValidator = new BoundingBoxValidator();
  const codeGenerationWorker = new CodeGenerationWorker(codeGenerator, jobRepository, objectStore, layoutValidator);
  const videoRenderingWorker = new VideoRenderingWorker(videoRenderer, jobRepository);

  // Stage name → worker process handler mapping
  const stageHandlers: Record<string, (job: Job<{ jobId: string }>) => Promise<void>> = {
    script_generation: (job) => scriptGenerationWorker.process(job),
    tts_generation: (job) => ttsGenerationWorker.process(job),
    transcription: (job) => transcriptionWorker.process(job),
    timestamp_mapping: (job) => timestampMappingWorker.process(job),
    direction_generation: (job) => directionGenerationWorker.process(job),
    code_generation: (job) => codeGenerationWorker.process(job),
    rendering: (job) => videoRenderingWorker.process(job),
  };

  // Single BullMQ Worker that dispatches based on job name (stage)
  const bullWorker = new Worker(
    PIPELINE_QUEUE_NAME,
    async (job: Job<{ jobId: string }>) => {
      console.log(`[worker] Processing stage: ${job.name} for job: ${job.data.jobId}`);
      const handler = stageHandlers[job.name];
      if (!handler) {
        throw new Error(`No handler registered for stage: ${job.name}`);
      }
      await handler(job);
      console.log(`[worker] Completed stage: ${job.name} for job: ${job.data.jobId}`);
    },
    { connection },
  );

  bullWorker.on("failed", (job, err) => {
    console.error(`[worker] FAILED stage: ${job?.name} for job: ${job?.data?.jobId}`, err.message);
  });

  bullWorker.on("error", (err) => {
    console.error("[worker] Worker error:", err.message);
  });

  return {
    async close(): Promise<void> {
      await bullWorker.close();
      await redisClient.quit();
    },
  };
}
