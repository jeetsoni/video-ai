import express from "express";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { healthRouter } from "./routes/health.route.js";
import { createPipelineModule } from "@/pipeline/presentation/factories/pipeline.factory.js";
import { createBrowserIdMiddleware } from "@/shared/presentation/middleware/browser-id.middleware.js";

export function createApp(deps?: {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
  redisConnection: { host: string; port: number };
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

  app.use(express.json());

  app.use("/health", healthRouter);

  if (deps) {
    app.use(createBrowserIdMiddleware(deps.prisma));
    app.use("/api/pipeline", createPipelineModule(deps));
  }

  return app;
}
