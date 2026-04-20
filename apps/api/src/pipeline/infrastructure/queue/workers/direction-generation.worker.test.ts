import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { DirectionGenerator } from "@/pipeline/application/interfaces/direction-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { WordTimestamp, SceneBoundary, SceneDirection } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import { DirectionGenerationWorker } from "./direction-generation.worker.js";

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

function makeSampleDirection(scene: SceneBoundary, words: WordTimestamp[]): SceneDirection {
  const FPS = 30;
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

function createPipelineJobAtDirectionGenerationStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({ id, topic: "Test topic", browserId: "test-browser-id", format, themeId });
  // Advance: script_generation -> script_review -> tts_generation -> transcription -> timestamp_mapping -> direction_generation
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
  return job;
}

describe("DirectionGenerationWorker", () => {
  let worker: DirectionGenerationWorker;
  let mockDirectionGenerator: { generateDirection: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };
  let mockQueueService: { enqueue: AnyMockFn };
  let mockEventPublisher: { publish: AnyMockFn; buffer: AnyMockFn; markComplete: AnyMockFn };

  beforeEach(() => {
    mockDirectionGenerator = {
      generateDirection: jest.fn() as AnyMockFn,
    };
    mockRepository = {
      save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      findById: jest.fn() as AnyMockFn,
      findAll: jest.fn() as AnyMockFn,
      count: jest.fn() as AnyMockFn,
    };
    mockQueueService = {
      enqueue: (jest.fn() as AnyMockFn).mockResolvedValue(Result.ok(undefined)),
    };
    mockEventPublisher = {
      publish: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      buffer: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      markComplete: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
    };
    worker = new DirectionGenerationWorker(
      mockDirectionGenerator as unknown as DirectionGenerator,
      mockRepository as unknown as PipelineJobRepository,
      mockQueueService as unknown as QueueService,
      mockEventPublisher as unknown as StreamEventPublisher,
    );
  });

  it("should generate directions for each scene, set scene directions, transition to code_generation, save, and enqueue next stage", async () => {
    const pipelineJob = createPipelineJobAtDirectionGenerationStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);

    const scene1Words = sampleTranscript.filter(
      (w) => w.start >= sampleScenePlan[0]!.startTime && w.end <= sampleScenePlan[0]!.endTime,
    );
    const scene2Words = sampleTranscript.filter(
      (w) => w.start >= sampleScenePlan[1]!.startTime && w.end <= sampleScenePlan[1]!.endTime,
    );

    const direction1 = makeSampleDirection(sampleScenePlan[0]!, scene1Words);
    const direction2 = makeSampleDirection(sampleScenePlan[1]!, scene2Words);

    mockDirectionGenerator.generateDirection
      .mockResolvedValueOnce(Result.ok(direction1))
      .mockResolvedValueOnce(Result.ok(direction2));

    await worker.process(createMockJob("job-1"));

    // First scene: no previousDirection
    expect(mockDirectionGenerator.generateDirection).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: sampleScenePlan[0],
        words: scene1Words,
        previousDirection: undefined,
      }),
    );
    // Second scene: previousDirection is direction1
    expect(mockDirectionGenerator.generateDirection).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: sampleScenePlan[1],
        words: scene2Words,
        previousDirection: direction1,
      }),
    );

    expect(pipelineJob.sceneDirections).toEqual([direction1, direction2]);
    expect(pipelineJob.stage.value).toBe("code_generation");
    expect(pipelineJob.status.value).toBe("processing");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
    expect(mockQueueService.enqueue).toHaveBeenCalledWith({
      stage: "code_generation",
      jobId: "job-1",
    });
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockDirectionGenerator.generateDirection).not.toHaveBeenCalled();
  });

  it("should throw when direction generation fails for a scene", async () => {
    const pipelineJob = createPipelineJobAtDirectionGenerationStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);

    const error = PipelineError.directionGenerationFailed("LLM timeout for scene 1");
    mockDirectionGenerator.generateDirection.mockResolvedValue(
      Result.fail<SceneDirection, PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it("should throw when scene plan is missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-3", topic: "Test topic", browserId: "test-browser-id", format, themeId });
    // Advance to direction_generation without setting scene plan
    pipelineJob.setScript("Generated script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script" }]);
    pipelineJob.transitionTo("script_review");
    pipelineJob.setApprovedScript("Approved script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script" }]);
    pipelineJob.transitionTo("tts_generation");
    pipelineJob.setAudioPath("audio/test.mp3");
    pipelineJob.transitionTo("transcription");
    pipelineJob.setTranscript(sampleTranscript);
    pipelineJob.transitionTo("timestamp_mapping");
    // Skip setScenePlan
    pipelineJob.transitionTo("direction_generation");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no scene plan",
    );
    expect(mockDirectionGenerator.generateDirection).not.toHaveBeenCalled();
  });

  it("should throw when transcript is missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-4", topic: "Test topic", browserId: "test-browser-id", format, themeId });
    // Advance to direction_generation without setting transcript
    pipelineJob.setScript("Generated script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script" }]);
    pipelineJob.transitionTo("script_review");
    pipelineJob.setApprovedScript("Approved script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script" }]);
    pipelineJob.transitionTo("tts_generation");
    pipelineJob.setAudioPath("audio/test.mp3");
    pipelineJob.transitionTo("transcription");
    // Skip setTranscript
    pipelineJob.transitionTo("timestamp_mapping");
    pipelineJob.setScenePlan(sampleScenePlan);
    pipelineJob.transitionTo("direction_generation");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-4"))).rejects.toThrow(
      "Pipeline job job-4 has no transcript",
    );
    expect(mockDirectionGenerator.generateDirection).not.toHaveBeenCalled();
  });
});
