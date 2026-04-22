import { jest } from "@jest/globals";
import { RetryJobUseCase } from "./retry-job.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

function makeFailedJobAtStage(stage: string): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.failed(),
    stage: PipelineStage.create(stage as any)!,
    error: null,
    generatedScript: null,
    approvedScript: null,
    generatedScenes: null,
    approvedScenes: null,
    audioPath: null,
    transcript: null,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 10,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeProcessingJobAtStage(stage: string): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.processing(),
    stage: PipelineStage.create(stage as any)!,
    error: null,
    generatedScript: null,
    approvedScript: null,
    generatedScenes: null,
    approvedScenes: null,
    audioPath: null,
    transcript: null,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 10,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeJobAtStatus(statusValue: string): PipelineJob {
  const statusMap: Record<string, PipelineStatus> = {
    awaiting_script_review: PipelineStatus.awaitingScriptReview(),
    completed: PipelineStatus.completed(),
    pending: PipelineStatus.pending(),
  };
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: statusMap[statusValue] ?? PipelineStatus.pending(),
    stage: PipelineStage.create("script_generation")!,
    error: null,
    generatedScript: null,
    approvedScript: null,
    generatedScenes: null,
    approvedScenes: null,
    audioPath: null,
    transcript: null,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 10,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
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

describe("RetryJobUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let queueService: jest.Mocked<QueueService>;
  let useCase: RetryJobUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    queueService = createMockQueueService();
    useCase = new RetryJobUseCase(repository, queueService);
  });

  it("happy path: failed job at processing stage clears failure, saves, and enqueues for current stage", async () => {
    const job = makeFailedJobAtStage("tts_generation");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(job);
    expect(queueService.enqueue).toHaveBeenCalledWith({
      stage: "tts_generation",
      jobId: "job-1",
    });
    // After clearFailure, status should be processing
    expect(job.status.value).toBe("processing");
    expect(job.error).toBeNull();
  });

  it("stuck processing job re-enqueues for current stage", async () => {
    const job = makeProcessingJobAtStage("tts_generation");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(job);
    expect(queueService.enqueue).toHaveBeenCalledWith({
      stage: "tts_generation",
      jobId: "job-1",
    });
  });

  it("returns CONFLICT for awaiting_script_review status", async () => {
    const job = makeJobAtStatus("awaiting_script_review");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("CONFLICT");
    expect(repository.save).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it("returns CONFLICT for completed status", async () => {
    const job = makeJobAtStatus("completed");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("CONFLICT");
    expect(repository.save).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for non-existent jobId", async () => {
    repository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ jobId: "does-not-exist" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
    expect(repository.save).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it("returns QUEUE_ERROR when QueueService fails", async () => {
    const job = makeFailedJobAtStage("tts_generation");
    repository.findById.mockResolvedValue(job);
    queueService.enqueue.mockResolvedValue(
      Result.fail(new PipelineError("Queue down", "script_generation_failed")),
    );

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("QUEUE_ERROR");
    expect(result.getError().message).toBe("Queue down");
    // save was still called before enqueue
    expect(repository.save).toHaveBeenCalledWith(job);
  });
});
