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
import { RedisRateLimiter } from "@/shared/infrastructure/rate-limiter/redis-rate-limiter.js";
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
import { SendScriptTweakUseCase } from "@/pipeline/application/use-cases/send-script-tweak.use-case.js";
import { GetScriptTweakMessagesUseCase } from "@/pipeline/application/use-cases/get-script-tweak-messages.use-case.js";
import { PrismaScriptTweakMessageRepository } from "@/pipeline/infrastructure/repositories/prisma-script-tweak-message.repository.js";
import { AIScriptTweaker } from "@/pipeline/infrastructure/services/ai-script-tweaker.js";
import { NoOpWebSearchProvider } from "@/pipeline/infrastructure/services/noop-web-search-provider.js";
import { ListShowcaseUseCase } from "@/pipeline/application/use-cases/list-showcase.use-case.js";

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

export function createPipelineModule(deps: {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
  redisConnection: string;
  elevenlabsApiKey: string;
}): Router {
  const repository = new PrismaPipelineJobRepository(deps.prisma);
  const queueService = new BullMQQueueService(deps.queue);

  const idGenerator = { generate: () => crypto.randomUUID() };

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
  const sendTweakUseCase = new SendTweakUseCase(
    repository,
    tweakMessageRepository,
    codeTweaker,
  );
  const getTweakMessagesUseCase = new GetTweakMessagesUseCase(
    repository,
    tweakMessageRepository,
  );
  const scriptTweakMessageRepository = new PrismaScriptTweakMessageRepository(
    deps.prisma,
  );
  const webSearchProvider = new NoOpWebSearchProvider();
  const scriptTweaker = new AIScriptTweaker(webSearchProvider);
  const sendScriptTweakUseCase = new SendScriptTweakUseCase(
    repository,
    scriptTweakMessageRepository,
    scriptTweaker,
  );
  const getScriptTweakMessagesUseCase = new GetScriptTweakMessagesUseCase(
    repository,
    scriptTweakMessageRepository,
  );
  const listShowcaseUseCase = new ListShowcaseUseCase(repository);
  const retryJobUseCase = new RetryJobUseCase(repository, queueService);
  const getPreviewDataUseCase = new GetPreviewDataUseCase(
    repository,
    deps.objectStore,
  );
  const exportVideoUseCase = new ExportVideoUseCase(repository, queueService);

  const voiceService = new ElevenLabsVoiceService(deps.elevenlabsApiKey);
  const listVoicesUseCase = new ListVoicesUseCase(voiceService);

  const getThemesFn = () =>
    deps.prisma.animationTheme.findMany({ orderBy: { sortOrder: "asc" } });

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
    sendScriptTweakUseCase,
    getScriptTweakMessagesUseCase,
    listShowcaseUseCase,
  );

  const redisClient = new Redis(deps.redisConnection);
  const streamEventBuffer = new RedisStreamEventBuffer(redisClient);
  const streamEventSubscriber = new RedisStreamEventSubscriber(redisClient);
  const sseResponseHelper = new ExpressSSEResponseHelper();

  const streamController = new StreamController(
    streamEventBuffer,
    streamEventSubscriber,
    sseResponseHelper,
    repository,
  );

  const progressRedisClient = new Redis(deps.redisConnection);
  const progressEventSubscriber = new RedisStreamEventSubscriber(
    progressRedisClient,
  );

  const progressController = new ProgressController(
    progressEventSubscriber,
    sseResponseHelper,
    repository,
    streamEventBuffer,
  );

  // --- Rate limiting (Redis-backed, survives restarts) ---
  const rateLimitRedis = new Redis(deps.redisConnection);

  // Generous enough for judges doing a full evaluation, strict enough to stop abuse
  const jobCreationLimiter = new RedisRateLimiter(
    rateLimitRedis, 5, TEN_MINUTES, "rl:job-create",
  );
  const llmOperationLimiter = new RedisRateLimiter(
    rateLimitRedis, 15, TEN_MINUTES, "rl:llm-op",
  );
  const exportLimiter = new RedisRateLimiter(
    rateLimitRedis, 3, TEN_MINUTES, "rl:export",
  );
  const voicePreviewLimiter = new RedisRateLimiter(
    rateLimitRedis, 25, ONE_MINUTE, "rl:voice-preview",
  );

  const pipelineRateLimiters = {
    jobCreation: createRateLimitMiddleware({
      limiter: jobCreationLimiter,
      message: "Hackathon demo limit reached — max 5 videos per 10 minutes. Please wait a moment and try again.",
    }),
    llmOperation: createRateLimitMiddleware({
      limiter: llmOperationLimiter,
      message: "Hackathon demo limit reached — AI generation requests are capped to manage costs. Please wait a few minutes.",
    }),
    exportOperation: createRateLimitMiddleware({
      limiter: exportLimiter,
      message: "Hackathon demo limit reached — max 3 exports per 10 minutes. Please wait a moment and try again.",
    }),
  };

  const voicePreviewRateLimitMiddleware = createRateLimitMiddleware({
    limiter: voicePreviewLimiter,
    message: "Hackathon demo limit reached — voice preview requests are capped. Please wait a moment.",
  });

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
  const voicePreviewRouter = createVoicePreviewRouter(
    voicePreviewController,
    voicePreviewRateLimitMiddleware,
  );

  const pipelineRouter = createPipelineRouter(
    controller,
    streamController,
    progressController,
    pipelineRateLimiters,
  );

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

  pipelineRouter.get("/jobs/:id/thumbnail", async (req, res) => {
    try {
      const job = await deps.prisma.pipelineJob.findUnique({
        where: { id: req.params.id },
      });
      if (!job || !job.thumbnailPath) {
        res.status(404).json({ error: "Thumbnail not found" });
        return;
      }
      const result = await deps.objectStore.getObject(job.thumbnailPath);
      if (result.isFailure) {
        res.status(500).json({ error: "Failed to retrieve thumbnail" });
        return;
      }
      const { data, contentType, contentLength } = result.getValue();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", contentLength);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

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

  const router = Router();
  router.use(pipelineRouter);
  router.use(voicePreviewRouter);
  return router;
}
