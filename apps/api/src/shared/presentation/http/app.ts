import express from "express";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { healthRouter } from "./routes/health.route.js";
import { createPipelineModule } from "@/pipeline/presentation/factories/pipeline.factory.js";
import { createBrowserIdMiddleware } from "@/shared/presentation/middleware/browser-id.middleware.js";
import { RedisRateLimiter } from "@/shared/infrastructure/rate-limiter/redis-rate-limiter.js";
import { createRateLimitMiddleware } from "@/shared/presentation/middleware/rate-limit.middleware.js";

export function createApp(deps?: {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
  redisConnection: string;
  elevenlabsApiKey: string;
}): express.Express {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Browser-Id");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "100kb" }));

  app.use("/health", healthRouter);

  if (deps) {
    // Global rate limit — safety net against automated abuse (IP-based)
    const globalRateLimitRedis = new Redis(deps.redisConnection);
    const globalLimiter = new RedisRateLimiter(
      globalRateLimitRedis, 100, 60 * 1000, "rl:global",
    );
    app.use(
      "/api",
      createRateLimitMiddleware({
        limiter: globalLimiter,
        keyStrategy: "ip",
        message: "Hackathon demo limit reached — too many requests. Please slow down and try again in a moment.",
      }),
    );

    app.use(createBrowserIdMiddleware(deps.prisma));
    app.use("/api/pipeline", createPipelineModule(deps));
  }

  return app;
}
