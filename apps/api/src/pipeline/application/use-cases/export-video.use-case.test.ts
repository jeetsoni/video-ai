import { jest } from "@jest/globals";
import { ExportVideoUseCase } from "./export-video.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";

function makeJobAtStage(stage: string, videoPath: string | null = null): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.completed(),
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
    generatedCode: "const x = 1;",
    codePath: null,
    videoPath,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 95,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

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

describe("ExportVideoUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let queueService: jest.Mocked<QueueService>;
  let useCase: ExportVideoUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    queueService = createMockQueueService();
    useCase = new ExportVideoUseCase(repository, queueService);
  });

  it("transitions a preview job to rendering and enqueues", async () => {
    const job = makeJobAtStage("preview");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(queueService.enqueue).toHaveBeenCalledWith({ stage: "rendering", jobId: "job-1" });
  });

  it("clears video URL, transitions a done job to rendering, and enqueues", async () => {
    const job = makeJobAtStage("done", "videos/job-1.mp4");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(job.videoPath).toBeNull();
    expect(queueService.enqueue).toHaveBeenCalledWith({ stage: "rendering", jobId: "job-1" });
  });

  it("returns INVALID_STAGE when job is not in preview or done", async () => {
    const job = makeJobAtStage("script_generation");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_STAGE");
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    // repository.findById already returns null by default

    const result = await useCase.execute({ jobId: "nonexistent" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });
});
