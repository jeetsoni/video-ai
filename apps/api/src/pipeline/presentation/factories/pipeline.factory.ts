import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { PrismaPipelineJobRepository } from "@/pipeline/infrastructure/repositories/prisma-pipeline-job.repository.js";
import { BullMQQueueService } from "@/pipeline/infrastructure/queue/queue-service.js";
import { CreatePipelineJobUseCase } from "@/pipeline/application/use-cases/create-pipeline-job.use-case.js";
import { GetJobStatusUseCase } from "@/pipeline/application/use-cases/get-job-status.use-case.js";
import { ListPipelineJobsUseCase } from "@/pipeline/application/use-cases/list-pipeline-jobs.use-case.js";
import { ApproveScriptUseCase } from "@/pipeline/application/use-cases/approve-script.use-case.js";
import { RegenerateScriptUseCase } from "@/pipeline/application/use-cases/regenerate-script.use-case.js";
import { PipelineController } from "@/pipeline/presentation/controllers/pipeline.controller.js";
import { createPipelineRouter } from "@/pipeline/presentation/routes/pipeline.routes.js";

export function createPipelineModule(deps: {
  prisma: PrismaClient;
  queue: Queue;
  objectStore: ObjectStore;
}): Router {
  // 1. Infrastructure
  const repository = new PrismaPipelineJobRepository(deps.prisma);
  const queueService = new BullMQQueueService(deps.queue);

  // 2. ID generator
  const idGenerator = { generate: () => crypto.randomUUID() };

  // 3. Use cases
  const createPipelineJobUseCase = new CreatePipelineJobUseCase(repository, queueService, idGenerator);
  const getJobStatusUseCase = new GetJobStatusUseCase(repository, deps.objectStore);
  const listPipelineJobsUseCase = new ListPipelineJobsUseCase(repository);
  const approveScriptUseCase = new ApproveScriptUseCase(repository, queueService);
  const regenerateScriptUseCase = new RegenerateScriptUseCase(repository, queueService);

  // 4. Themes query
  const getThemesFn = () =>
    deps.prisma.animationTheme.findMany({ orderBy: { sortOrder: "asc" } });

  // 5. Controller
  const controller = new PipelineController(
    createPipelineJobUseCase,
    getJobStatusUseCase,
    listPipelineJobsUseCase,
    approveScriptUseCase,
    regenerateScriptUseCase,
    getThemesFn,
  );

  // 6. Router
  return createPipelineRouter(controller);
}
