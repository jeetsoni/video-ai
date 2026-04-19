import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type { LayoutValidator } from "@/pipeline/application/interfaces/layout-validator.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { WordTimestamp, SceneBoundary, SceneDirection, ValidationResult } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { CodeGenerationWorker } from "./code-generation.worker.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

function createMockJob(jobId: string): Job<{ jobId: string }> {
  return { data: { jobId } } as Job<{ jobId: string }>;
}

const sampleTranscript: WordTimestamp[] = [
  { word: "Hello", start: 0, end: 0.5 },
  { word: "world", start: 0.5, end: 1.0 },
  { word: "this", start: 1.0, end: 1.5 },
  { word: "is", start: 1.5, end: 2.0 },
  { word: "a", start: 2.0, end: 2.3 },
  { word: "test", start: 2.3, end: 3.0 },
];

const sampleScenePlan: SceneBoundary[] = [
  { id: 1, name: "Intro", type: "Hook", startTime: 0, endTime: 1.5, text: "Hello world this" },
  { id: 2, name: "Body", type: "Bridge", startTime: 1.5, endTime: 3.0, text: "is a test" },
];

const FPS = 30;

function makeSampleDirection(scene: SceneBoundary, words: WordTimestamp[]): SceneDirection {
  return {
    id: scene.id,
    name: scene.name,
    type: scene.type,
    description: "energetic",
    startTime: scene.startTime,
    endTime: scene.endTime,
    startFrame: Math.round(scene.startTime * FPS),
    endFrame: Math.round(scene.endTime * FPS),
    durationFrames: Math.round(scene.endTime * FPS) - Math.round(scene.startTime * FPS),
    text: scene.text,
    words,
    animationDirection: {
      colorAccent: "#06B6D4",
      mood: "energetic",
      layout: "centered",
      beats: [
        {
          id: `${scene.id}-beat-1`,
          timeRange: [scene.startTime, (scene.startTime + scene.endTime) / 2],
          frameRange: [
            Math.round(scene.startTime * FPS),
            Math.round(((scene.startTime + scene.endTime) / 2) * FPS),
          ],
          spokenText: "first half",
          visual: "text animation",
          typography: "bold 48px",
          motion: "fade in",
          sfx: ["whoosh"],
        },
        {
          id: `${scene.id}-beat-2`,
          timeRange: [(scene.startTime + scene.endTime) / 2, scene.endTime],
          frameRange: [
            Math.round(((scene.startTime + scene.endTime) / 2) * FPS),
            Math.round(scene.endTime * FPS),
          ],
          spokenText: "second half",
          visual: "icon reveal",
          typography: "medium 36px",
          motion: "slide up",
          sfx: ["pop"],
        },
      ],
    },
  };
}

const sampleDirections: SceneDirection[] = [
  makeSampleDirection(
    sampleScenePlan[0]!,
    sampleTranscript.filter((w) => w.start >= sampleScenePlan[0]!.startTime && w.end <= sampleScenePlan[0]!.endTime),
  ),
  makeSampleDirection(
    sampleScenePlan[1]!,
    sampleTranscript.filter((w) => w.start >= sampleScenePlan[1]!.startTime && w.end <= sampleScenePlan[1]!.endTime),
  ),
];

function createPipelineJobAtCodeGenerationStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({ id, topic: "Test topic", format, themeId });
  // Advance through all prior stages
  job.setScript("Generated script content", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script content" }]);
  job.transitionTo("script_review");
  job.setApprovedScript("Approved script content", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script content" }]);
  job.transitionTo("tts_generation");
  job.setAudioPath("audio/test-uuid.mp3");
  job.transitionTo("transcription");
  job.setTranscript(sampleTranscript);
  job.transitionTo("timestamp_mapping");
  job.setScenePlan(sampleScenePlan);
  job.transitionTo("direction_generation");
  job.setSceneDirections(sampleDirections);
  job.transitionTo("code_generation");
  return job;
}

describe("CodeGenerationWorker", () => {
  let worker: CodeGenerationWorker;
  let mockCodeGenerator: { generateCode: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };
  let mockObjectStore: { upload: AnyMockFn; getSignedUrl: AnyMockFn };
  let mockLayoutValidator: { validate: AnyMockFn };
  let mockEventPublisher: { publish: AnyMockFn; buffer: AnyMockFn; markComplete: AnyMockFn };

  const validValidationResult: ValidationResult = {
    valid: true,
    violations: [],
    boundingBoxes: [],
    summary: "All elements are within bounds and no overlaps detected.",
  };

  beforeEach(() => {
    mockCodeGenerator = {
      generateCode: jest.fn() as AnyMockFn,
    };
    mockRepository = {
      save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      findById: jest.fn() as AnyMockFn,
      findAll: jest.fn() as AnyMockFn,
      count: jest.fn() as AnyMockFn,
    };
    mockObjectStore = {
      upload: (jest.fn() as AnyMockFn).mockResolvedValue(Result.ok("code/job-1.tsx")),
      getSignedUrl: jest.fn() as AnyMockFn,
    };
    mockLayoutValidator = {
      validate: (jest.fn() as AnyMockFn).mockResolvedValue(Result.ok(validValidationResult)),
    };
    mockEventPublisher = {
      publish: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      buffer: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      markComplete: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
    };
    worker = new CodeGenerationWorker(
      mockCodeGenerator as unknown as CodeGenerator,
      mockRepository as unknown as PipelineJobRepository,
      mockObjectStore as unknown as ObjectStore,
      mockLayoutValidator as unknown as LayoutValidator,
      mockEventPublisher as unknown as StreamEventPublisher,
    );
  });

  it("should generate code, store in object store, set generated code + code path, transition to preview, and save", async () => {
    const pipelineJob = createPipelineJobAtCodeGenerationStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);

    const generatedCode = 'export default function Main() { return <div>Hello</div>; }';
    mockCodeGenerator.generateCode.mockResolvedValue(Result.ok(generatedCode));

    await worker.process(createMockJob("job-1"));

    expect(mockCodeGenerator.generateCode).toHaveBeenCalledWith(
      expect.objectContaining({
        scenePlan: expect.objectContaining({
          title: "Test topic",
          totalDuration: 3.0,
          fps: 30,
          totalFrames: Math.round(3.0 * 30),
          scenes: sampleDirections,
        }),
        theme: expect.objectContaining({ id: "studio" }),
        layoutProfile: expect.objectContaining({ id: "faceless" }),
      }),
    );

    expect(mockObjectStore.upload).toHaveBeenCalledWith({
      key: "code/job-1.tsx",
      data: Buffer.from(generatedCode),
      contentType: "text/typescript",
    });

    expect(pipelineJob.generatedCode).toBe(generatedCode);
    expect(pipelineJob.codePath).toBe("code/job-1.tsx");
    expect(pipelineJob.stage.value).toBe("preview");
    expect(pipelineJob.status.value).toBe("completed");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockCodeGenerator.generateCode).not.toHaveBeenCalled();
  });

  it("should throw when code generation fails", async () => {
    const pipelineJob = createPipelineJobAtCodeGenerationStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);

    const error = PipelineError.codeGenerationFailed("LLM timeout");
    mockCodeGenerator.generateCode.mockResolvedValue(Result.fail(error));

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockObjectStore.upload).not.toHaveBeenCalled();
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it("should throw when scene directions are missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-3", topic: "Test topic", format, themeId });
    // Advance to code_generation without setting scene directions
    pipelineJob.setScript("Generated script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script" }]);
    pipelineJob.transitionTo("script_review");
    pipelineJob.setApprovedScript("Approved script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script" }]);
    pipelineJob.transitionTo("tts_generation");
    pipelineJob.setAudioPath("audio/test.mp3");
    pipelineJob.transitionTo("transcription");
    pipelineJob.setTranscript(sampleTranscript);
    pipelineJob.transitionTo("timestamp_mapping");
    pipelineJob.setScenePlan(sampleScenePlan);
    pipelineJob.transitionTo("direction_generation");
    // Skip setSceneDirections
    pipelineJob.transitionTo("code_generation");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no scene directions",
    );
    expect(mockCodeGenerator.generateCode).not.toHaveBeenCalled();
  });

  it("should mark job failed and throw when object store upload fails", async () => {
    const pipelineJob = createPipelineJobAtCodeGenerationStage("job-4");
    mockRepository.findById.mockResolvedValue(pipelineJob);

    const generatedCode = 'export default function Main() { return <div>Hello</div>; }';
    mockCodeGenerator.generateCode.mockResolvedValue(Result.ok(generatedCode));

    const uploadError = PipelineError.codeGenerationFailed("Upload failed: storage unavailable");
    mockObjectStore.upload.mockResolvedValue(Result.fail(uploadError));

    await expect(worker.process(createMockJob("job-4"))).rejects.toThrow(uploadError);
    expect(pipelineJob.status.value).toBe("failed");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
  });
});
