import { jest } from "@jest/globals";
import { GetPreviewDataUseCase } from "./get-preview-data.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { ANIMATION_THEMES } from "@video-ai/shared";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type { SceneDirection, WordTimestamp } from "@video-ai/shared";

const VALID_THEME_ID = ANIMATION_THEMES[0]!.id;

function makeSceneDirection(): SceneDirection {
  return {
    id: 1,
    name: "Hook",
    type: "Hook",
    description: "Opening hook scene",
    startTime: 0,
    endTime: 5,
    startFrame: 0,
    endFrame: 150,
    durationFrames: 150,
    text: "Hello world",
    words: [{ word: "Hello", start: 0, end: 0.5 }, { word: "world", start: 0.6, end: 1.0 }],
    animationDirection: {
      colorAccent: "#ff0000",
      mood: "energetic",
      layout: "centered",
      beats: [],
    },
  };
}

function makeWordTimestamp(word: string, start: number, end: number): WordTimestamp {
  return { word, start, end };
}

function makePreviewJob(): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create(VALID_THEME_ID).getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.completed(),
    stage: PipelineStage.create("preview")!,
    error: null,
    generatedScript: null,
    approvedScript: null,
    generatedScenes: null,
    approvedScenes: null,
    audioPath: "audio/job-1.mp3",
    transcript: [makeWordTimestamp("Hello", 0, 0.5), makeWordTimestamp("world", 0.6, 1.0)],
    scenePlan: null,
    sceneDirections: [makeSceneDirection()],
    generatedCode: "export default function() { return <div>Hello</div>; }",
    codePath: null,
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 95,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeJobMissingArtifact(missing: "code" | "sceneDirections" | "transcript"): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create(VALID_THEME_ID).getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.completed(),
    stage: PipelineStage.create("preview")!,
    error: null,
    generatedScript: null,
    approvedScript: null,
    generatedScenes: null,
    approvedScenes: null,
    audioPath: "audio/job-1.mp3",
    transcript: missing === "transcript" ? null : [makeWordTimestamp("Hello", 0, 0.5)],
    scenePlan: null,
    sceneDirections: missing === "sceneDirections" ? null : [makeSceneDirection()],
    generatedCode: missing === "code" ? null : "export default function() { return <div/>; }",
    codePath: null,
    videoPath: null,
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

function createMockObjectStore(): jest.Mocked<ObjectStore> {
  return {
    getSignedUrl: jest.fn<ObjectStore["getSignedUrl"]>().mockResolvedValue(Result.ok<string, PipelineError>("https://signed-url.example.com/audio.mp3")),
    upload: jest.fn<ObjectStore["upload"]>().mockResolvedValue(Result.ok<string, PipelineError>("key")),
    getObject: jest.fn<ObjectStore["getObject"]>().mockResolvedValue(Result.ok({ data: Buffer.from(""), contentType: "application/octet-stream", contentLength: 0 })),
  };
}

describe("GetPreviewDataUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let objectStore: jest.Mocked<ObjectStore>;
  let useCase: GetPreviewDataUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    objectStore = createMockObjectStore();
    useCase = new GetPreviewDataUseCase(repository, objectStore);
  });

  it("returns preview data for a job in 'preview' stage with all artifacts", async () => {
    const job = makePreviewJob();
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.code).toBe("export default function() { return <div>Hello</div>; }");
    expect(data.scenePlan).toBeDefined();
    expect(data.scenePlan.title).toBe("How databases work");
    expect(data.scenePlan.fps).toBe(30);
    expect(typeof data.scenePlan.totalDuration).toBe("number");
    expect(typeof data.scenePlan.totalFrames).toBe("number");
    expect(data.scenePlan.designSystem).toBeDefined();
    expect(Array.isArray(data.scenePlan.scenes)).toBe(true);
    expect(data.format).toBe("short");
    expect(data.fps).toBe(30);
    expect(typeof data.totalFrames).toBe("number");
    expect(data.compositionWidth).toBeGreaterThan(0);
    expect(data.compositionHeight).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    repository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ jobId: "missing-job" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when job is not in a valid preview stage", async () => {
    const job = PipelineJob.reconstitute({
      id: "job-1",
      browserId: "browser-1",
      topic: "How databases work",
      format: VideoFormat.create("short").getValue(),
      themeId: AnimationThemeId.create(VALID_THEME_ID).getValue(),
      voiceId: null,
      voiceSettings: null,
      status: PipelineStatus.processing(),
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
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when job has no generated code", async () => {
    const job = makeJobMissingArtifact("code");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when job has no scene directions", async () => {
    const job = makeJobMissingArtifact("sceneDirections");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when job has no transcript", async () => {
    const job = makeJobMissingArtifact("transcript");
    repository.findById.mockResolvedValue(job);

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
  });
});
