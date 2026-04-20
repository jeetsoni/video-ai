import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { TimestampMapper } from "@/pipeline/application/interfaces/timestamp-mapper.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { TimestampMappingWorker } from "./timestamp-mapping.worker.js";

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

const sampleApprovedScenes: SceneBoundary[] = [
  {
    id: 1,
    name: "Intro",
    type: "Hook",
    startTime: 0,
    endTime: 0,
    text: "Hello world this",
  },
  {
    id: 2,
    name: "Body",
    type: "Bridge",
    startTime: 0,
    endTime: 0,
    text: "is a test",
  },
];

const mappedScenes: SceneBoundary[] = [
  {
    id: 1,
    name: "Intro",
    type: "Hook",
    startTime: 0,
    endTime: 1.5,
    text: "Hello world this",
  },
  {
    id: 2,
    name: "Body",
    type: "Bridge",
    startTime: 1.5,
    endTime: 3.0,
    text: "is a test",
  },
];

function createPipelineJobAtTimestampMappingStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();

  return PipelineJob.reconstitute({
    id,
    browserId: "test-browser-id",
    topic: "Test topic",
    format,
    themeId,
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.processing(),
    stage: PipelineStage.create("timestamp_mapping")!,
    error: null,
    generatedScript: "Hello world this is a test",
    approvedScript: "Hello world this is a test",
    generatedScenes: sampleApprovedScenes,
    approvedScenes: sampleApprovedScenes,
    audioPath: "audio/test-uuid.mp3",
    transcript: sampleTranscript,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    progressPercent: 55,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("TimestampMappingWorker", () => {
  let worker: TimestampMappingWorker;
  let mockTimestampMapper: { mapTimestamps: AnyMockFn };
  let mockRepository: {
    save: AnyMockFn;
    findById: AnyMockFn;
    findAll: AnyMockFn;
    count: AnyMockFn;
  };
  let mockQueueService: { enqueue: AnyMockFn };
  let mockEventPublisher: { publish: AnyMockFn; buffer: AnyMockFn; markComplete: AnyMockFn };

  beforeEach(() => {
    mockTimestampMapper = {
      mapTimestamps: jest.fn() as AnyMockFn,
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
    worker = new TimestampMappingWorker(
      mockTimestampMapper as unknown as TimestampMapper,
      mockRepository as unknown as PipelineJobRepository,
      mockQueueService as unknown as QueueService,
      mockEventPublisher as unknown as StreamEventPublisher,
    );
  });

  it("should map timestamps, transition to direction_generation, save, and enqueue next stage", async () => {
    const pipelineJob = createPipelineJobAtTimestampMappingStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    mockTimestampMapper.mapTimestamps.mockReturnValue(Result.ok(mappedScenes));

    await worker.process(createMockJob("job-1"));

    expect(mockTimestampMapper.mapTimestamps).toHaveBeenCalledWith({
      scenes: sampleApprovedScenes,
      transcript: sampleTranscript,
    });
    expect(pipelineJob.scenePlan).toEqual(mappedScenes);
    expect(pipelineJob.stage.value).toBe("direction_generation");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
    expect(mockQueueService.enqueue).toHaveBeenCalledWith({
      stage: "direction_generation",
      jobId: "job-1",
    });
  });

  it("should mark job as failed when timestamp mapper returns an error", async () => {
    const pipelineJob = createPipelineJobAtTimestampMappingStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.timestampMappingFailed("Text alignment failed");
    mockTimestampMapper.mapTimestamps.mockReturnValue(
      Result.fail<SceneBoundary[], PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);

    expect(pipelineJob.status.value).toBe("failed");
    expect(pipelineJob.error?.code).toBe("timestamp_mapping_failed");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
    expect(mockQueueService.enqueue).not.toHaveBeenCalled();
  });

  it("should throw when job has no approved scenes", async () => {
    const pipelineJob = createPipelineJobAtTimestampMappingStage("job-3");
    // Override approvedScenes to null via reconstitute
    const jobWithoutScenes = PipelineJob.reconstitute({
      id: "job-3",
      browserId: "test-browser-id",
      topic: "Test topic",
      format: pipelineJob.format,
      themeId: pipelineJob.themeId,
      voiceId: null,
      voiceSettings: null,
      status: PipelineStatus.processing(),
      stage: PipelineStage.create("timestamp_mapping")!,
      error: null,
      generatedScript: "Hello world this is a test",
      approvedScript: "Hello world this is a test",
      generatedScenes: null,
      approvedScenes: null,
      audioPath: "audio/test-uuid.mp3",
      transcript: sampleTranscript,
      scenePlan: null,
      sceneDirections: null,
      generatedCode: null,
      codePath: null,
      videoPath: null,
      progressPercent: 55,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepository.findById.mockResolvedValue(jobWithoutScenes);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no approved scenes",
    );
    expect(mockTimestampMapper.mapTimestamps).not.toHaveBeenCalled();
  });

  it("should throw when job has no transcript", async () => {
    const jobWithoutTranscript = PipelineJob.reconstitute({
      id: "job-4",
      browserId: "test-browser-id",
      topic: "Test topic",
      format: VideoFormat.create("short").getValue(),
      themeId: AnimationThemeId.create("studio").getValue(),
      voiceId: null,
      voiceSettings: null,
      status: PipelineStatus.processing(),
      stage: PipelineStage.create("timestamp_mapping")!,
      error: null,
      generatedScript: "Hello world this is a test",
      approvedScript: "Hello world this is a test",
      generatedScenes: sampleApprovedScenes,
      approvedScenes: sampleApprovedScenes,
      audioPath: "audio/test-uuid.mp3",
      transcript: null,
      scenePlan: null,
      sceneDirections: null,
      generatedCode: null,
      codePath: null,
      videoPath: null,
      progressPercent: 55,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepository.findById.mockResolvedValue(jobWithoutTranscript);

    await expect(worker.process(createMockJob("job-4"))).rejects.toThrow(
      "Pipeline job job-4 has no transcript",
    );
    expect(mockTimestampMapper.mapTimestamps).not.toHaveBeenCalled();
  });
});
