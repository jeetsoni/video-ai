import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import { DEFAULT_VOICE_SETTINGS } from "@video-ai/shared";
import type { TTSService } from "@/pipeline/application/interfaces/tts-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { TTSGenerationWorker } from "./tts-generation.worker.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

function createMockJob(jobId: string): Job<{ jobId: string }> {
  return { data: { jobId } } as Job<{ jobId: string }>;
}

function createPipelineJobAtTTSStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({ id, topic: "Test topic", browserId: "test-browser-id", format, themeId });
  const scenes = [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script content" }];
  // Advance to tts_generation stage: script_generation -> script_review -> tts_generation
  job.setScript("Generated script content", scenes);
  job.transitionTo("script_review");
  job.setApprovedScript("Approved script content", scenes);
  job.transitionTo("tts_generation");
  return job;
}

describe("TTSGenerationWorker", () => {
  let worker: TTSGenerationWorker;
  let mockTTSService: { generateSpeech: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };
  let mockQueueService: { enqueue: AnyMockFn };
  const voiceId = "test-voice-id";

  beforeEach(() => {
    mockTTSService = {
      generateSpeech: jest.fn() as AnyMockFn,
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
    const mockEventPublisher = {
      publish: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      buffer: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      markComplete: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
    };
    worker = new TTSGenerationWorker(
      mockTTSService as unknown as TTSService,
      mockRepository as unknown as PipelineJobRepository,
      mockQueueService as unknown as QueueService,
      voiceId,
      mockEventPublisher as unknown as StreamEventPublisher,
    );
  });

  it("should generate speech, set audio path, transition to transcription, save, and enqueue next stage", async () => {
    const pipelineJob = createPipelineJobAtTTSStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    mockTTSService.generateSpeech.mockResolvedValue(
      Result.ok({
        audioPath: "audio/test-uuid.mp3",
        format: "mp3" as const,
        timestamps: [
          { word: "Approved", start: 0, end: 0.4 },
          { word: "script", start: 0.4, end: 0.8 },
          { word: "content", start: 0.8, end: 1.2 },
        ],
      }),
    );

    await worker.process(createMockJob("job-1"));

    expect(mockTTSService.generateSpeech).toHaveBeenCalledWith({
      text: "Approved script content",
      voiceId: "test-voice-id",
      voiceSettings: DEFAULT_VOICE_SETTINGS,
    });
    expect(pipelineJob.audioPath).toBe("audio/test-uuid.mp3");
    expect(pipelineJob.transcript).toEqual([
      { word: "Approved", start: 0, end: 0.4 },
      { word: "script", start: 0.4, end: 0.8 },
      { word: "content", start: 0.8, end: 1.2 },
    ]);
    expect(pipelineJob.stage.value).toBe("timestamp_mapping");
    expect(pipelineJob.status.value).toBe("processing");
    expect(mockRepository.save).toHaveBeenCalledWith(pipelineJob);
    expect(mockQueueService.enqueue).toHaveBeenCalledWith({
      stage: "timestamp_mapping",
      jobId: "job-1",
    });
  });

  it("should throw when pipeline job is not found", async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(worker.process(createMockJob("missing-id"))).rejects.toThrow(
      "Pipeline job not found: missing-id",
    );
    expect(mockTTSService.generateSpeech).not.toHaveBeenCalled();
  });

  it("should throw when TTS generation fails", async () => {
    const pipelineJob = createPipelineJobAtTTSStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.ttsGenerationFailed("ElevenLabs timeout");
    mockTTSService.generateSpeech.mockResolvedValue(
      Result.fail<{ audioPath: string; format: "mp3" }, PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it("should throw when approved script is missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-3", topic: "Test topic", browserId: "test-browser-id", format, themeId });
    // Advance to tts_generation but without setting approvedScript
    const scenes = [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script" }];
    pipelineJob.setScript("Generated script", scenes);
    pipelineJob.transitionTo("script_review");
    // Skip setApprovedScript — transition directly
    pipelineJob.transitionTo("tts_generation");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no approved script",
    );
    expect(mockTTSService.generateSpeech).not.toHaveBeenCalled();
  });
});
