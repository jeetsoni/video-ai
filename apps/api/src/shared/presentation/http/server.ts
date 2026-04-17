import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createPipelineQueue } from "@/pipeline/infrastructure/queue/pipeline-queue.js";
import { MinioObjectStore } from "@/pipeline/infrastructure/services/minio-object-store.js";
import { createWorkerRegistry } from "@/pipeline/infrastructure/queue/worker-registry.js";
import { createApp } from "./app.js";

// Load root .env (monorepo level), then local .env overrides
config({ path: resolve(import.meta.dirname, "../../../../../../.env") });
config();

async function main() {
  const port = process.env["API_PORT"] ?? 4000;

  // --- Redis connection ---
  const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
  const redisConnection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
  };

  // --- MinIO config ---
  const minioEndpoint = process.env["MINIO_ENDPOINT"] ?? "localhost";
  const minioPort = process.env["MINIO_PORT"] ?? "9000";
  const minioUseSsl = process.env["MINIO_USE_SSL"] === "true";
  const minioProtocol = minioUseSsl ? "https" : "http";

  const objectStore = new MinioObjectStore({
    endpoint: `${minioProtocol}://${minioEndpoint}:${minioPort}`,
    region: "us-east-1",
    bucket: process.env["MINIO_BUCKET"] ?? "video-ai",
    accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
    secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    forcePathStyle: true,
  });

  // --- ElevenLabs config ---
  const elevenLabsApiKey = process.env["ELEVENLABS_API_KEY"] ?? "";
  const elevenLabsVoiceId = process.env["ELEVENLABS_VOICE_ID"] ?? "21m00Tcm4TlvDq8ikWAM";

  // --- Shared dependencies ---
  const prisma = new PrismaClient();
  const queue = createPipelineQueue(redisConnection);

  // --- Express app ---
  const app = createApp({ prisma, queue, objectStore });

  // --- BullMQ workers ---
  const workerRegistry = createWorkerRegistry({
    prisma,
    queue,
    objectStore,
    connection: redisConnection,
    elevenLabsApiKey,
    elevenLabsVoiceId,
  });

  // --- Start server ---
  app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`);
  });

  // --- Graceful shutdown ---
  const shutdown = async () => {
    console.log("Shutting down...");
    await workerRegistry.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
