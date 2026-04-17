import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { ScriptGenerator } from "@/pipeline/application/interfaces/script-generator.js";
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
  let mockScriptGenerator: { generate: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };

  beforeEach(() => {
    mockScriptGenerator = {
      generate: jest.fn() as AnyMockFn,
    };
    mockRepository = {
      save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      findById: jest.fn() as AnyMockFn,
      findAll: jest.fn() as AnyMockFn,
      count: jest.fn() as AnyMockFn,
    };
    worker = new ScriptGenerationWorker(
      mockScriptGenerator as unknown as ScriptGenerator,
      mockRepository as unknown as PipelineJobRepository,
    );
  });

  it("should generate script, set it on the job, transition to script_review, and save", async () => {
    const pipelineJob = createPipelineJob("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    mockScriptGenerator.generate.mockResolvedValue(
      Result.ok("Generated script content"),
    );

    await worker.process(createMockJob("job-1"));

    expect(mockScriptGenerator.generate).toHaveBeenCalledWith({
      topic: "Test topic",
      format: "short",
    });
    expect(pipelineJob.generatedScript).toBe("Generated script content");
    expect(pipelineJob.stage.value).toBe("script_review");
    expect(pipelineJob.status.value).toBe("awaiting_script_review");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockScriptGenerator.generate).not.toHaveBeenCalled();
  });

  it("should throw the error when script generation fails", async () => {
    const pipelineJob = createPipelineJob("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.scriptGenerationFailed("LLM timeout");
    mockScriptGenerator.generate.mockResolvedValue(
      Result.fail<string, PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });
});
