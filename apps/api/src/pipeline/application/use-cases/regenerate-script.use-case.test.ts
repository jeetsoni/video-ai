import { jest } from "@jest/globals";
import { RegenerateScriptUseCase } from "./regenerate-script.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

function makeJob(): PipelineJob {
  return PipelineJob.create({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
  });
}

function makeJobAtScriptReview(): PipelineJob {
  const job = makeJob();
  job.setScript("Generated script content for testing purposes here", []);
  job.transitionTo("script_review");
  return job;
}

function createMockRepository(): jest.Mocked<PipelineJobRepository> {
  return {
    save: jest.fn<PipelineJobRepository["save"]>().mockResolvedValue(undefined),
    findById: jest
      .fn<PipelineJobRepository["findById"]>()
      .mockResolvedValue(null),
    findAll: jest
      .fn<PipelineJobRepository["findAll"]>()
      .mockResolvedValue([]),
    count: jest.fn<PipelineJobRepository["count"]>().mockResolvedValue(0),
    findAllCompleted: jest.fn<PipelineJobRepository["findAllCompleted"]>().mockResolvedValue([]),
    countCompleted: jest.fn<PipelineJobRepository["countCompleted"]>().mockResolvedValue(0),
  };
}

function createMockQueueService(): jest.Mocked<QueueService> {
  return {
    enqueue: jest
      .fn<QueueService["enqueue"]>()
      .mockResolvedValue(Result.ok(undefined)),
  };
}

describe("RegenerateScriptUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let queueService: jest.Mocked<QueueService>;
  let useCase: RegenerateScriptUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    queueService = createMockQueueService();
    useCase = new RegenerateScriptUseCase(repository, queueService);
  });

  it("transitions job to script_generation and returns success", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(queueService.enqueue).toHaveBeenCalledWith({
      stage: "script_generation",
      jobId: "job-1",
    });
  });

  it("saves the job before enqueuing", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    await useCase.execute({ jobId: "job-1" });

    expect(repository.save).toHaveBeenCalledWith(job);
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    const result = await useCase.execute({ jobId: "missing-job" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns CONFLICT when job is not in awaiting_script_review status", async () => {
    const job = makeJob(); // starts in "pending" status
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("CONFLICT");
  });
});
