import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { PrismaPipelineJobRepository } from "@/pipeline/infrastructure/repositories/prisma-pipeline-job.repository.js";
import { BullMQQueueService } from "@/pipeline/infrastructure/queue/queue-service.js";
import { CreatePipelineJobUseCase } from "@/pipeline/application/use-cases/create-pipeline-job.use-case.js";
import { GetJobStatusUseCase } from "@/pipeline/application/use-cases/get-job-status.use-case.js";
import { ListPipelineJobsUseCase } from "@/pipeline/application/use-cases/list-pipeline-jobs.use-case.js";
import { ApproveScriptUseCase } from "@/pipeline/application/use-cases/approve-script.use-case.js";
import { RegenerateScriptUseCase } from "@/pipeline/application/use-cases/regenerate-script.use-case.js";
import { RegenerateCodeUseCase } from "@/pipeline/application/use-cases/regenerate-code.use-case.js";
import { AutofixCodeUseCase } from "@/pipeline/application/use-cases/autofix-code.use-case.js";
import { RetryJobUseCase } from "@/pipeline/application/use-cases/retry-job.use-case.js";
import { GetPreviewDataUseCase } from "@/pipeline/application/use-cases/get-preview-data.use-case.js";
import { ExportVideoUseCase } from "@/pipeline/application/use-cases/export-video.use-case.js";
import { ListVoicesUseCase } from "@/pipeline/application/use-cases/list-voices.use-case.js";
import { ElevenLabsVoiceService } from "@/pipeline/infrastructure/services/elevenlabs-voice-service.js";
import { ElevenLabsTTSService } from "@/pipeline/infrastructure/services/elevenlabs-tts-service.js";
import { InMemoryRateLimiter } from "@/shared/infrastructure/rate-limiter/in-memory-rate-limiter.js";
import { GenerateVoicePreviewUseCase } from "@/pipeline/application/use-cases/generate-voice-preview.use-case.js";
import { VoicePreviewController } from "@/pipeline/presentation/controllers/voice-preview.controller.js";
import { createRateLimitMiddleware } from "@/shared/presentation/middleware/rate-limit.middleware.js";
import { PipelineController } from "@/pipeline/presentation/controllers/pipeline.controller.js";
import { StreamController } from "@/pipeline/presentation/controllers/stream.controller.js";
import { ProgressController } from "@/pipeline/presentation/controllers/progress.controller.js";
import { RedisStreamEventBuffer } from "@/shared/infrastructure/streaming/stream-event-buffer.js";
import { RedisStreamEventSubscriber } from "@/shared/infrastructure/streaming/stream-event-subscriber.js";
import { ExpressSSEResponseHelper } from "@/shared/infrastructure/streaming/sse-response-helper.js";
import { createPipelineRouter } from "@/pipeline/presentation/routes/pipeline.routes.js";
import { createVoicePreviewRouter } from "@/pipeline/presentation/routes/voice-preview.routes.js";
import { AICodeAutoFixer } from "@/pipeline/infrastructure/services/ai-code-autofixer.js";
import { PrismaTweakMessageRepository } from "@/pipeline/infrastructure/repositories/prisma-tweak-message.repository.js";
import { AICodeTweaker } from "@/pipeline/infrastructure/services/ai-code-tweaker.js";
import { SendTweakUseCase } from "@/pipeline/application/use-cases/send-tweak.use-case.js";
import { GetTweakMessagesUseCase } from "@/pipeline/application/use-cases/get-tweak-messages.use-case.js";
import { ListShowcaseUseCase } from "@/pipeline/application/use-cases/list-showcase.use-case.js";

export function createPipelineModule(deps: {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
  redisConnection: string;
  elevenlabsApiKey: string;
}): Router {
  // 1. Infrastructure
  const repository = new PrismaPipelineJobRepository(deps.prisma);
  const queueService = new BullMQQueueService(deps.queue);

  // 2. ID generator
  const idGenerator = { generate: () => crypto.randomUUID() };

  // 3. Use cases
  const createPipelineJobUseCase = new CreatePipelineJobUseCase(
    repository,
    queueService,
    idGenerator,
  );
  const getJobStatusUseCase = new GetJobStatusUseCase(
    repository,
    deps.objectStore,
  );
  const listPipelineJobsUseCase = new ListPipelineJobsUseCase(repository);
  const approveScriptUseCase = new ApproveScriptUseCase(
    repository,
    queueService,
  );
  const regenerateScriptUseCase = new RegenerateScriptUseCase(
    repository,
    queueService,
  );
  const regenerateCodeUseCase = new RegenerateCodeUseCase(
    repository,
    queueService,
  );
  const codeAutoFixer = new AICodeAutoFixer();
  const autofixCodeUseCase = new AutofixCodeUseCase(repository, codeAutoFixer);
  const tweakMessageRepository = new PrismaTweakMessageRepository(deps.prisma);
  const codeTweaker = new AICodeTweaker();
  const sendTweakUseCase = new SendTweakUseCase(repository, tweakMessageRepository, codeTweaker);
  const getTweakMessagesUseCase = new GetTweakMessagesUseCase(repository, tweakMessageRepository);
  const listShowcaseUseCase = new ListShowcaseUseCase(repository);
  const retryJobUseCase = new RetryJobUseCase(repository, queueService);
  const getPreviewDataUseCase = new GetPreviewDataUseCase(
    repository,
    deps.objectStore,
  );
  const exportVideoUseCase = new ExportVideoUseCase(repository, queueService);

  // Voice service + use case
  const voiceService = new ElevenLabsVoiceService(deps.elevenlabsApiKey);
  const listVoicesUseCase = new ListVoicesUseCase(voiceService);

  // 4. Themes query
  const getThemesFn = () =>
    deps.prisma.animationTheme.findMany({ orderBy: { sortOrder: "asc" } });

  // 5. Pipeline controller
  const controller = new PipelineController(
    createPipelineJobUseCase,
    getJobStatusUseCase,
    listPipelineJobsUseCase,
    approveScriptUseCase,
    regenerateScriptUseCase,
    regenerateCodeUseCase,
    autofixCodeUseCase,
    retryJobUseCase,
    getThemesFn,
    getPreviewDataUseCase,
    exportVideoUseCase,
    listVoicesUseCase,
    sendTweakUseCase,
    getTweakMessagesUseCase,
    listShowcaseUseCase,
  );

  // 6. Streaming SSE infrastructure
  // Use URL string directly - ioredis parses it including password
  const redisClient = new Redis(deps.redisConnection);
  const streamEventBuffer = new RedisStreamEventBuffer(redisClient);
  const streamEventSubscriber = new RedisStreamEventSubscriber(redisClient);
  const sseResponseHelper = new ExpressSSEResponseHelper();

  // 7. Stream controller
  const streamController = new StreamController(
    streamEventBuffer,
    streamEventSubscriber,
    sseResponseHelper,
    repository,
  );

  // 8. Progress SSE infrastructure
  const progressRedisClient = new Redis(deps.redisConnection);
  const progressEventSubscriber = new RedisStreamEventSubscriber(
    progressRedisClient,
  );

  // 9. Progress controller
  const progressController = new ProgressController(
    progressEventSubscriber,
    sseResponseHelper,
    repository,
    streamEventBuffer,
  );

  // 10. Voice preview
  const ttsService = new ElevenLabsTTSService(
    { apiKey: deps.elevenlabsApiKey },
    deps.objectStore,
  );
  const generateVoicePreviewUseCase = new GenerateVoicePreviewUseCase(
    ttsService,
  );
  const voicePreviewController = new VoicePreviewController(
    generateVoicePreviewUseCase,
  );
  const rateLimiter = new InMemoryRateLimiter(10, 60_000);
  const rateLimitMiddleware = createRateLimitMiddleware(rateLimiter);
  const voicePreviewRouter = createVoicePreviewRouter(
    voicePreviewController,
    rateLimitMiddleware,
  );

  // 11. Pipeline router + audio proxy route
  const pipelineRouter = createPipelineRouter(
    controller,
    streamController,
    progressController,
  );

  // 12. Audio proxy route (serves audio through API to avoid browser/MinIO compatibility issues)
  pipelineRouter.get("/jobs/:id/audio", async (req, res) => {
    try {
      const job = await deps.prisma.pipelineJob.findUnique({
        where: { id: req.params.id },
      });
      if (!job || !job.audioPath) {
        res.status(404).json({ error: "Audio not found" });
        return;
      }

      const result = await deps.objectStore.getObject(job.audioPath);
      if (result.isFailure) {
        res.status(500).json({ error: "Failed to retrieve audio" });
        return;
      }

      const { data, contentType, contentLength } = result.getValue();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", contentLength);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 13. Video proxy route (avoids MinIO MetadataTooLarge on signed URLs)
  pipelineRouter.get("/jobs/:id/video", async (req, res) => {
    try {
      const job = await deps.prisma.pipelineJob.findUnique({
        where: { id: req.params.id },
      });
      if (!job || !job.videoPath) {
        res.status(404).json({ error: "Video not found" });
        return;
      }

      const result = await deps.objectStore.getObject(job.videoPath);
      if (result.isFailure) {
        res.status(500).json({ error: "Failed to retrieve video" });
        return;
      }

      const { data, contentType, contentLength } = result.getValue();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", contentLength);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 14. Combine routers
  const router = Router();
  router.use(pipelineRouter);
  router.use(voicePreviewRouter);
  return router;
}
