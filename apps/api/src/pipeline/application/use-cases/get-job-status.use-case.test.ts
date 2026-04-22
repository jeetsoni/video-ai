import { jest } from "@jest/globals";
import { GetJobStatusUseCase } from "./get-job-status.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { JobError } from "@/pipeline/domain/value-objects/job-error.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";

function makeJob(overrides?: { id?: string }): PipelineJob {
  return PipelineJob.create({
    id: overrides?.id ?? "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
  });
}

function makeJobAtPreview(): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.completed(),
    stage: PipelineStage.create("preview")!,
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
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 95,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeCompletedJobWithVideo(): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.completed(),
    stage: PipelineStage.create("done")!,
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
    videoPath: "videos/job-1.mp4",
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 100,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeJobWithError(): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.failed(),
    stage: PipelineStage.create("script_generation")!,
    error: JobError.create("script_generation_failed", "Script failed").getValue(),
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
    findById: jest.fn<PipelineJobRepository["findById"]>().mockResolvedValue(null),
    findAll: jest.fn<PipelineJobRepository["findAll"]>().mockResolvedValue([]),
    count: jest.fn<PipelineJobRepository["count"]>().mockResolvedValue(0),
    findAllCompleted: jest.fn<PipelineJobRepository["findAllCompleted"]>().mockResolvedValue([]),
    countCompleted: jest.fn<PipelineJobRepository["countCompleted"]>().mockResolvedValue(0),
  };
}

function createMockObjectStore(): jest.Mocked<ObjectStore> {
  return {
    getSignedUrl: jest.fn<ObjectStore["getSignedUrl"]>().mockResolvedValue(Result.ok<string, PipelineError>("https://signed-url.example.com/video.mp4")),
    upload: jest.fn<ObjectStore["upload"]>().mockResolvedValue(Result.ok<string, PipelineError>("key")),
    getObject: jest.fn<ObjectStore["getObject"]>().mockResolvedValue(Result.ok({ data: Buffer.from(""), contentType: "application/octet-stream", contentLength: 0 })),
  };
}

describe("GetJobStatusUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let objectStore: jest.Mocked<ObjectStore>;
  let useCase: GetJobStatusUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    objectStore = createMockObjectStore();
    useCase = new GetJobStatusUseCase(repository, objectStore);
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    repository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ jobId: "missing-job" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns PipelineJobDto with all base fields for an existing job", async () => {
    const job = makeJob();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.id).toBe("job-1");
    expect(dto.topic).toBe("How databases work");
    expect(dto.format).toBe("short");
    expect(dto.themeId).toBe("studio");
    expect(dto.status).toBeDefined();
    expect(dto.stage).toBeDefined();
    expect(dto.progressPercent).toBeDefined();
    expect(dto.createdAt).toBeDefined();
    expect(dto.updatedAt).toBeDefined();
  });

  it("includes signed videoUrl in DTO for completed job with videoPath", async () => {
    const job = makeCompletedJobWithVideo();
    repository.findById.mockResolvedValue(job);
    objectStore.getSignedUrl.mockResolvedValue(Result.ok("https://signed-url.example.com/video.mp4"));

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.videoUrl).toBe("https://signed-url.example.com/video.mp4");
    expect(objectStore.getSignedUrl).toHaveBeenCalledWith("videos/job-1.mp4");
  });

  it("includes errorCode and errorMessage in DTO for a failed job", async () => {
    const job = makeJobWithError();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.errorCode).toBe("script_generation_failed");
    expect(dto.errorMessage).toBe("Script failed");
  });

  it("includes codeChanged field for job in preview stage with generated code", async () => {
    const job = makeJobAtPreview();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.codeChanged).toBe(true);
  });

  it("includes codeChanged field for job in done stage with generated code", async () => {
    const job = PipelineJob.reconstitute({
      id: "job-1",
      browserId: "browser-1",
      topic: "How databases work",
      format: VideoFormat.create("short").getValue(),
      themeId: AnimationThemeId.create("studio").getValue(),
      voiceId: null,
      voiceSettings: null,
      status: PipelineStatus.completed(),
      stage: PipelineStage.create("done")!,
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
      videoPath: null,
      thumbnailPath: null,
      lastRenderedCodeHash: null,
      progressPercent: 100,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    });
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.codeChanged).toBe(true);
  });

  it("does not call getSignedUrl when job status is not completed", async () => {
    const job = makeJob();
    repository.findById.mockResolvedValue(job);

    await useCase.execute({ jobId: "job-1" });

    expect(objectStore.getSignedUrl).not.toHaveBeenCalled();
  });
});
