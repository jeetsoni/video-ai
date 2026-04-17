import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { ScenePlanner } from "@/pipeline/application/interfaces/scene-planner.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { ScenePlanningWorker } from "./scene-planning.worker.js";

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

function createPipelineJobAtScenePlanningStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({ id, topic: "Test topic", format, themeId });
  // Advance: script_generation -> script_review -> tts_generation -> transcription -> scene_planning
  job.setScript("Generated script content");
  job.transitionTo("script_review");
  job.setApprovedScript("Approved script content");
  job.transitionTo("tts_generation");
  job.setAudioPath("audio/test-uuid.mp3");
  job.transitionTo("transcription");
  job.setTranscript(sampleTranscript);
  job.transitionTo("scene_planning");
  return job;
}

describe("ScenePlanningWorker", () => {
  let worker: ScenePlanningWorker;
  let mockScenePlanner: { planScenes: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };

  beforeEach(() => {
    mockScenePlanner = {
      planScenes: jest.fn() as AnyMockFn,
    };
    mockRepository = {
      save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      findById: jest.fn() as AnyMockFn,
      findAll: jest.fn() as AnyMockFn,
      count: jest.fn() as AnyMockFn,
    };
    worker = new ScenePlanningWorker(
      mockScenePlanner as unknown as ScenePlanner,
      mockRepository as unknown as PipelineJobRepository,
    );
  });

  it("should plan scenes, set scene plan, transition to scene_plan_review, and save (no enqueue)", async () => {
    const pipelineJob = createPipelineJobAtScenePlanningStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    mockScenePlanner.planScenes.mockResolvedValue(Result.ok(sampleScenePlan));

    await worker.process(createMockJob("job-1"));

    expect(mockScenePlanner.planScenes).toHaveBeenCalledWith({
      transcript: sampleTranscript,
      fullText: "Hello world this is a test",
      totalDuration: 3.0,
    });
    expect(pipelineJob.scenePlan).toEqual(sampleScenePlan);
    expect(pipelineJob.stage.value).toBe("scene_plan_review");
    expect(pipelineJob.status.value).toBe("awaiting_scene_plan_review");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockScenePlanner.planScenes).not.toHaveBeenCalled();
  });

  it("should throw the error when scene planning fails", async () => {
    const pipelineJob = createPipelineJobAtScenePlanningStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.scenePlanningFailed("LLM timeout");
    mockScenePlanner.planScenes.mockResolvedValue(
      Result.fail<SceneBoundary[], PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it("should throw when transcript is missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-3", topic: "Test topic", format, themeId });
    // Advance to scene_planning without setting transcript
    pipelineJob.setScript("Generated script");
    pipelineJob.transitionTo("script_review");
    pipelineJob.setApprovedScript("Approved script");
    pipelineJob.transitionTo("tts_generation");
    pipelineJob.setAudioPath("audio/test.mp3");
    pipelineJob.transitionTo("transcription");
    // Skip setTranscript — transition directly
    pipelineJob.transitionTo("scene_planning");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no transcript",
    );
    expect(mockScenePlanner.planScenes).not.toHaveBeenCalled();
  });
});
