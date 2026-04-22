import { jest } from "@jest/globals";
import { CreatePipelineJobUseCase } from "./create-pipeline-job.use-case.js";
import { Result } from "@/shared/domain/result.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { IdGenerator } from "@/shared/domain/interfaces/id-generator.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

function createMockRepository(): jest.Mocked<PipelineJobRepository> {
  return {
    save: jest.fn<PipelineJobRepository["save"]>().mockResolvedValue(undefined),
    findById: jest.fn<PipelineJobRepository["findById"]>().mockResolvedValue(null),
    findAll: jest.fn<PipelineJobRepository["findAll"]>().mockResolvedValue([]),
    count: jest.fn<PipelineJobRepository["count"]>().mockResolvedValue(0),
    findAllCompleted: jest.fn<PipelineJobRepository["findAllCompleted"]>().mockResolvedValue([]),
    countCompleted: jest.fn<PipelineJobRepository["countCompleted"]>().mockResolvedValue(0),
  };
}

function createMockQueueService(): jest.Mocked<QueueService> {
  return {
    enqueue: jest.fn<QueueService["enqueue"]>().mockResolvedValue(Result.ok(undefined)),
  };
}

function createMockIdGenerator(id: string = "generated-id"): IdGenerator {
  return { generate: () => id };
}

const validRequest = {
  topic: "How databases work",
  format: "short",
  themeId: "studio",
  browserId: "browser-1",
};

describe("CreatePipelineJobUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let queueService: jest.Mocked<QueueService>;
  let idGenerator: IdGenerator;
  let useCase: CreatePipelineJobUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    queueService = createMockQueueService();
    idGenerator = createMockIdGenerator("test-job-id");
    useCase = new CreatePipelineJobUseCase(repository, queueService, idGenerator);
  });

  it("returns successful Result with job id and pending status on valid request", async () => {
    const result = await useCase.execute(validRequest);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ id: "test-job-id", status: "pending" });
  });

  it("calls repository.save exactly once with a PipelineJob entity", async () => {
    await useCase.execute(validRequest);

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(expect.any(PipelineJob));
  });

  it("calls queueService.enqueue with stage script_generation and the generated job id", async () => {
    await useCase.execute(validRequest);

    expect(queueService.enqueue).toHaveBeenCalledWith({
      stage: "script_generation",
      jobId: "test-job-id",
    });
  });

  it("returns failed Result with ValidationError when format is invalid", async () => {
    const result = await useCase.execute({ ...validRequest, format: "invalid-format" });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(Error);
  });

  it("returns failed Result with code INVALID_INPUT when topic is shorter than 3 chars", async () => {
    const result = await useCase.execute({ ...validRequest, topic: "ab" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_INPUT");
  });

  it("returns failed Result with code QUEUE_ERROR when QueueService fails", async () => {
    queueService.enqueue.mockResolvedValue(
      Result.fail(new PipelineError("Queue down", "script_generation_failed")),
    );

    const result = await useCase.execute(validRequest);

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("QUEUE_ERROR");
  });
});
