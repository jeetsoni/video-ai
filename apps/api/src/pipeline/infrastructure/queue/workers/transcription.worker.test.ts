import { jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { TranscriptionService } from "@/pipeline/application/interfaces/transcription-service.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { QueueService } from "@/pipeline/application/interfaces/queue-service.js";
import type { StreamEventPublisher } from "@/shared/infrastructure/streaming/interfaces.js";
import type { WordTimestamp } from "@video-ai/shared";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { TranscriptionWorker } from "./transcription.worker.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

function createMockJob(jobId: string): Job<{ jobId: string }> {
  return { data: { jobId } } as Job<{ jobId: string }>;
}

function createPipelineJobAtTranscriptionStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({ id, topic: "Test topic", browserId: "test-browser-id", format, themeId });
  // Advance to transcription stage: script_generation -> script_review -> tts_generation -> transcription
  job.setScript("Generated script content", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script content" }]);
  job.transitionTo("script_review");
  job.setApprovedScript("Approved script content", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script content" }]);
  job.transitionTo("tts_generation");
  job.setAudioPath("audio/test-uuid.mp3");
  job.transitionTo("transcription");
  return job;
}

const sampleTranscript: WordTimestamp[] = [
  { word: "Hello", start: 0, end: 0.5 },
  { word: "world", start: 0.5, end: 1.0 },
];

describe("TranscriptionWorker", () => {
  let worker: TranscriptionWorker;
  let mockTranscriptionService: { transcribe: AnyMockFn };
  let mockRepository: { save: AnyMockFn; findById: AnyMockFn; findAll: AnyMockFn; count: AnyMockFn };
  let mockQueueService: { enqueue: AnyMockFn };
  let mockEventPublisher: { publish: AnyMockFn; buffer: AnyMockFn; markComplete: AnyMockFn };

  beforeEach(() => {
    mockTranscriptionService = {
      transcribe: jest.fn() as AnyMockFn,
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
    worker = new TranscriptionWorker(
      mockTranscriptionService as unknown as TranscriptionService,
      mockRepository as unknown as PipelineJobRepository,
      mockQueueService as unknown as QueueService,
      mockEventPublisher as unknown as StreamEventPublisher,
    );
  });

  it("should transcribe audio, set transcript, transition to timestamp_mapping, save, and enqueue next stage", async () => {
    const pipelineJob = createPipelineJobAtTranscriptionStage("job-1");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    mockTranscriptionService.transcribe.mockResolvedValue(
      Result.ok(sampleTranscript),
    );

    await worker.process(createMockJob("job-1"));

    expect(mockTranscriptionService.transcribe).toHaveBeenCalledWith({
      audioPath: "audio/test-uuid.mp3",
      scriptText: "Approved script content",
    });
    expect(pipelineJob.transcript).toEqual(sampleTranscript);
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
    expect(mockTranscriptionService.transcribe).not.toHaveBeenCalled();
  });

  it("should throw when transcription fails", async () => {
    const pipelineJob = createPipelineJobAtTranscriptionStage("job-2");
    mockRepository.findById.mockResolvedValue(pipelineJob);
    const error = PipelineError.transcriptionFailed("Transcription timeout");
    mockTranscriptionService.transcribe.mockResolvedValue(
      Result.fail<WordTimestamp[], PipelineError>(error),
    );

    await expect(worker.process(createMockJob("job-2"))).rejects.toThrow(error);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it("should throw when audio path is missing", async () => {
    const format = VideoFormat.create("short").getValue();
    const themeId = AnimationThemeId.create("studio").getValue();
    const pipelineJob = PipelineJob.create({ id: "job-3", topic: "Test topic", browserId: "test-browser-id", format, themeId });
    // Advance to transcription but without setting audioPath
    pipelineJob.setScript("Generated script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Generated script" }]);
    pipelineJob.transitionTo("script_review");
    pipelineJob.setApprovedScript("Approved script", [{ id: 1, name: "Hook", type: "Hook" as const, startTime: 0, endTime: 0, text: "Approved script" }]);
    pipelineJob.transitionTo("tts_generation");
    // Skip setAudioPath — transition directly
    pipelineJob.transitionTo("transcription");

    mockRepository.findById.mockResolvedValue(pipelineJob);

    await expect(worker.process(createMockJob("job-3"))).rejects.toThrow(
      "Pipeline job job-3 has no audio path",
    );
    expect(mockTranscriptionService.transcribe).not.toHaveBeenCalled();
  });
});
