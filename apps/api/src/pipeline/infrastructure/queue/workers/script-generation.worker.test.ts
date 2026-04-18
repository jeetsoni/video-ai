import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { StreamingScriptGenerator } from "@/pipeline/application/interfaces/streaming-script-generator.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { ScriptGenerationWorker } from "./script-generation.worker.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

function createMockJob(jobId: string): Job<{ jobId: string }> {
  return { data: { jobId } } as Job<{ jobId: string }>;
}

function createPipelineJob(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  return PipelineJob.create({ id, topic: "Test topic", format, themeId });
}

describe("ScriptGenerationWorker", () => {
  let worker: ScriptGenerationWorker;
  let mockStreamingGenerator: { generateStream: AnyMockFn };
  let mockEventPublisher: { publish: AnyMockFn; buffer: AnyMockFn; markComplete: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };

  beforeEach(() => {
    mockStreamingGenerator = {
      generateStream: jest.fn() as AnyMockFn,
    };
    mockEventPublisher = {
      publish: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      buffer: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      markComplete: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
    };
    mockRepository = {
      save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      findById: jest.fn() as AnyMockFn,
      findAll: jest.fn() as AnyMockFn,
      count: jest.fn() as AnyMockFn,
    };
    worker = new ScriptGenerationWorker(
      mockStreamingGenerator as unknown as StreamingScriptGenerator,
      mockEventPublisher as unknown as StreamEventPublisher,
      mockRepository as unknown as PipelineJobRepository,
    );
  });

  it("should generate script via streaming, set it on the job, transition to script_review, and save", async () => {
    const pipelineJob = createPipelineJob("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const mockScenes = [
      { id: 1, name: "Hook", type: "Hook" as const, text: "Generated script content", startTime: 0, endTime: 0 },
    ];
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onDone: (r: { script: string; scenes: typeof mockScenes }) => void }) => {
      params.onDone({ script: "Generated script content", scenes: mockScenes });
      return Result.ok({ script: "Generated script content", scenes: mockScenes });
    });

    await worker.process(createMockJob("job-1"));

    expect(mockStreamingGenerator.generateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "Test topic",
        format: "short",
      }),
    );
    expect(pipelineJob.generatedScript).toBe("Generated script content");
    expect(pipelineJob.generatedScenes).toEqual(mockScenes);
    expect(pipelineJob.stage.value).toBe("script_review");
    expect(pipelineJob.status.value).toBe("awaiting_script_review");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockStreamingGenerator.generateStream).not.toHaveBeenCalled();
  });

  it("should mark job as failed and return gracefully when script generation fails", async () => {
    const pipelineJob = createPipelineJob("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.scriptGenerationFailed("LLM timeout");
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onError: (e: PipelineError) => void }) => {
      params.onError(error);
      return Result.fail(error);
    });

    await worker.process(createMockJob("job-2"));

    expect(pipelineJob.status.value).toBe("failed");
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it("should publish chunk events with incrementing seq to correct channels", async () => {
    const pipelineJob = createPipelineJob("job-3");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const mockScenes = [
      { id: 1, name: "Hook", type: "Hook" as const, text: "Hello world", startTime: 0, endTime: 0 },
    ];
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onChunk: (t: string) => void; onDone: (r: { script: string; scenes: typeof mockScenes }) => void }) => {
      params.onChunk("Hello ");
      params.onChunk("world");
      params.onDone({ script: "Hello world", scenes: mockScenes });
      return Result.ok({ script: "Hello world", scenes: mockScenes });
    });

    await worker.process(createMockJob("job-3"));

    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      "stream:script:job-3",
      { type: "chunk", seq: 1, data: { text: "Hello " } },
    );
    expect(mockEventPublisher.buffer).toHaveBeenCalledWith(
      "stream:buffer:script:job-3",
      { type: "chunk", seq: 1, data: { text: "Hello " } },
    );
    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      "stream:script:job-3",
      { type: "chunk", seq: 2, data: { text: "world" } },
    );
  });

  it("should publish scene events with incrementing seq", async () => {
    const pipelineJob = createPipelineJob("job-4");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const scene = { id: 1, name: "Hook", type: "Hook" as const, text: "Hook text", startTime: 0, endTime: 0 };
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onChunk: (t: string) => void; onScene: (s: typeof scene) => void; onDone: (r: { script: string; scenes: typeof scene[] }) => void }) => {
      params.onChunk("Hook text");
      params.onScene(scene);
      params.onDone({ script: "Hook text", scenes: [scene] });
      return Result.ok({ script: "Hook text", scenes: [scene] });
    });

    await worker.process(createMockJob("job-4"));

    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      "stream:script:job-4",
      { type: "scene", seq: 2, data: scene },
    );
  });

  it("should publish done event and mark buffer complete with 1-hour TTL", async () => {
    const pipelineJob = createPipelineJob("job-5");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const mockScenes = [
      { id: 1, name: "Hook", type: "Hook" as const, text: "Done text", startTime: 0, endTime: 0 },
    ];
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onDone: (r: { script: string; scenes: typeof mockScenes }) => void }) => {
      params.onDone({ script: "Done text", scenes: mockScenes });
      return Result.ok({ script: "Done text", scenes: mockScenes });
    });

    await worker.process(createMockJob("job-5"));

    // Allow microtasks to flush (void promises)
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      "stream:script:job-5",
      expect.objectContaining({ type: "done", seq: 1 }),
    );
    expect(mockEventPublisher.markComplete).toHaveBeenCalledWith(
      "stream:buffer:script:job-5",
      3600,
    );
  });

  it("should publish error event when generation fails", async () => {
    const pipelineJob = createPipelineJob("job-6");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.scriptGenerationFailed("LLM crashed");
    mockStreamingGenerator.generateStream.mockImplementation(async (params: { onError: (e: PipelineError) => void }) => {
      params.onError(error);
      return Result.fail(error);
    });

    await worker.process(createMockJob("job-6"));

    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      "stream:script:job-6",
      expect.objectContaining({ type: "error", seq: 1 }),
    );
    expect(pipelineJob.status.value).toBe("failed");
  });
});
