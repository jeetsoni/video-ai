import { jest } from "@jest/globals";
import { ApproveScriptUseCase } from "./approve-script.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { FORMAT_WORD_RANGES } from "@video-ai/shared";
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

describe("ApproveScriptUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let queueService: jest.Mocked<QueueService>;
  let useCase: ApproveScriptUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    queueService = createMockQueueService();
    useCase = new ApproveScriptUseCase(repository, queueService);
  });

  it("approves generated script and returns success when job is in awaiting_script_review with no edited script", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(job);
    expect(queueService.enqueue).toHaveBeenCalledWith({
      stage: "tts_generation",
      jobId: "job-1",
    });
  });

  it("transitions to tts_generation when edited script is within format word range", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const range = FORMAT_WORD_RANGES["short"];
    const validScript = Array(range.min + 5)
      .fill("word")
      .join(" ");

    const result = await useCase.execute({
      jobId: "job-1",
      editedScript: validScript,
    });

    expect(result.isSuccess).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(job);
  });

  it("returns INVALID_WORD_COUNT when edited script has fewer than 10 words", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({
      jobId: "job-1",
      editedScript: "too short script",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_WORD_COUNT");
  });

  it("returns INVALID_WORD_COUNT when edited script is outside format word range", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const range = FORMAT_WORD_RANGES["short"];
    const tooLongScript = Array(range.max + 10)
      .fill("word")
      .join(" ");

    const result = await useCase.execute({
      jobId: "job-1",
      editedScript: tooLongScript,
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_WORD_COUNT");
  });

  it("returns NOT_FOUND when jobId does not exist", async () => {
    repository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ jobId: "nonexistent" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns CONFLICT when job is not in awaiting_script_review status", async () => {
    const job = makeJob(); // starts in "pending" / "script_generation"
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("CONFLICT");
  });

  it("updates job voice selection when voiceId is provided and returns success", async () => {
    const job = makeJobAtScriptReview();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({
      jobId: "job-1",
      voiceId: "voice-123",
      voiceSettings: { speed: 1.0, stability: 0.5, similarityBoost: 0.75, style: 0 },
    });

    expect(result.isSuccess).toBe(true);
    expect(job.voiceId).toBe("voice-123");
    expect(repository.save).toHaveBeenCalledWith(job);
  });
});
