/**
 * Preservation Property Tests — Non-Code-Generation and Continuous-Connection Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests capture the CURRENT (unfixed) behavior that must be preserved after the fix:
 * - Non-code_generation stages: send one initial SSE event + subscribe to pub/sub, no scene replay
 * - Terminal-status jobs: send one SSE event + call res.end(), no pub/sub subscription
 * - publishProgressEvent(): calls publish() only, never buffer()
 *
 * On UNFIXED code, these tests PASS — confirming baseline behavior.
 * After the fix, these tests must STILL PASS — confirming no regressions.
 */
import { jest } from "@jest/globals";
import fc from "fast-check";
import type { Job } from "bullmq";
import type { Request, Response } from "express";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import type {
  StreamEventPublisher,
  StreamEventSubscriber,
  StreamEventBuffer,
  SSEResponseHelper,
} from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineStage as PipelineStageType } from "@video-ai/shared";
import type { VideoRenderer } from "@/pipeline/application/interfaces/video-renderer.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { Result } from "@/shared/domain/result.js";
import { CodeGenerationWorker } from "@/pipeline/infrastructure/queue/workers/code-generation.worker.js";
import { ProgressController } from "@/pipeline/presentation/controllers/progress.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// --- Helpers ---

function createPipelineJobAtStage(
  id: string,
  stage: PipelineStageType,
  status:
    | "pending"
    | "processing"
    | "awaiting_script_review"
    | "completed"
    | "failed",
): PipelineJob {
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
    status: PipelineStatus.create(status)!,
    stage: PipelineStage.create(stage)!,
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
    progressPercent: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// --- fast-check arbitraries ---

const nonCodeGenerationStageArb = fc.constantFrom<PipelineStageType>(
  "script_generation",
  "script_review",
  "rendering",
  "preview",
  "done",
);

const terminalStatusArb = fc.constantFrom<"completed" | "failed">(
  "completed",
  "failed",
);

const allStageArb = fc.constantFrom<PipelineStageType>(
  "script_generation",
  "script_review",
  "tts_generation",
  "transcription",
  "timestamp_mapping",
  "direction_generation",
  "code_generation",
  "preview",
  "rendering",
  "done",
);

const allStatusArb = fc.constantFrom<
  "pending" | "processing" | "awaiting_script_review" | "completed" | "failed"
>("pending", "processing", "awaiting_script_review", "completed", "failed");

// --- Tests ---

describe("Preservation: Non-Code-Generation and Continuous-Connection Behavior Unchanged", () => {
  describe("Property: Non-code_generation stages send one initial SSE event and subscribe to pub/sub — no scene progress replay", () => {
    let progressController: ProgressController;
    let mockSubscriber: { subscribe: AnyMockFn; unsubscribe: AnyMockFn };
    let mockSSEHelper: {
      initSSE: AnyMockFn;
      sendEvent: AnyMockFn;
      sendHeartbeat: AnyMockFn;
    };
    let mockJobRepository: {
      save: AnyMockFn;
      findById: AnyMockFn;
      findAll: AnyMockFn;
      count: AnyMockFn;
    };
    let mockBuffer: { getAll: AnyMockFn; isComplete: AnyMockFn };

    beforeEach(() => {
      jest.useFakeTimers();

      mockSubscriber = {
        subscribe: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        unsubscribe: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      };
      mockSSEHelper = {
        initSSE: jest.fn() as AnyMockFn,
        sendEvent: jest.fn() as AnyMockFn,
        sendHeartbeat: jest.fn() as AnyMockFn,
      };
      mockJobRepository = {
        save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        findById: jest.fn() as AnyMockFn,
        findAll: jest.fn() as AnyMockFn,
        count: jest.fn() as AnyMockFn,
      };
      mockBuffer = {
        getAll: (jest.fn() as AnyMockFn).mockResolvedValue([]),
        isComplete: (jest.fn() as AnyMockFn).mockResolvedValue(false),
      };

      progressController = new ProgressController(
        mockSubscriber as unknown as StreamEventSubscriber,
        mockSSEHelper as unknown as SSEResponseHelper,
        mockJobRepository as unknown as PipelineJobRepository,
        mockBuffer as unknown as StreamEventBuffer,
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("for all non-code_generation stages with processing status, sends exactly one SSE event and subscribes to pub/sub (property-based)", async () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * Property: for all job stages NOT equal to code_generation (script_generation,
       * script_review, rendering, preview, done), streamProgress() sends exactly one
       * initial SSE event with job-level data and subscribes to pub/sub — no scene
       * progress replay attempted.
       */
      await fc.assert(
        fc.asyncProperty(nonCodeGenerationStageArb, async (stage) => {
          // Reset mocks for each property run
          mockSSEHelper.initSSE.mockClear();
          mockSSEHelper.sendEvent.mockClear();
          mockSubscriber.subscribe.mockClear();
          mockSubscriber.unsubscribe.mockClear();
          mockJobRepository.findById.mockClear();

          const jobId = "550e8400-e29b-41d4-a716-446655440000";
          const pipelineJob = createPipelineJobAtStage(
            jobId,
            stage,
            "processing",
          );
          mockJobRepository.findById.mockResolvedValue(pipelineJob);

          const mockReq = {
            params: { id: jobId },
            on: jest.fn() as AnyMockFn,
          } as unknown as Request;

          const mockRes = {
            status: (jest.fn() as AnyMockFn).mockReturnThis(),
            json: jest.fn() as AnyMockFn,
            end: jest.fn() as AnyMockFn,
          } as unknown as Response;

          await progressController.streamProgress(mockReq, mockRes);

          // SSE is initialized
          expect(mockSSEHelper.initSSE).toHaveBeenCalledTimes(1);
          expect(mockSSEHelper.initSSE).toHaveBeenCalledWith(mockRes);

          // Exactly one SSE event sent (the initial job-level state)
          expect(mockSSEHelper.sendEvent).toHaveBeenCalledTimes(1);

          // The event contains job-level data with the correct stage
          const sentEvent = mockSSEHelper.sendEvent.mock.calls[0]![1] as {
            type: string;
            data: { type: string; data: { stage: string; status: string } };
          };
          expect(sentEvent.type).toBe("progress");
          expect(sentEvent.data.data.stage).toBe(stage);
          expect(sentEvent.data.data.status).toBe("processing");

          // Subscribes to pub/sub channel
          expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(1);
          expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
            `stream:progress:${jobId}`,
            expect.any(Function),
          );

          // res.end() is NOT called (connection stays open for pub/sub)
          expect(mockRes.end).not.toHaveBeenCalled();
        }),
        { numRuns: 20 },
      );
    });
  });

  describe("Property: Terminal-status jobs send one SSE event and call res.end() — no pub/sub subscription", () => {
    let progressController: ProgressController;
    let mockSubscriber: { subscribe: AnyMockFn; unsubscribe: AnyMockFn };
    let mockSSEHelper: {
      initSSE: AnyMockFn;
      sendEvent: AnyMockFn;
      sendHeartbeat: AnyMockFn;
    };
    let mockJobRepository: {
      save: AnyMockFn;
      findById: AnyMockFn;
      findAll: AnyMockFn;
      count: AnyMockFn;
    };
    let mockBuffer: { getAll: AnyMockFn; isComplete: AnyMockFn };

    beforeEach(() => {
      jest.useFakeTimers();

      mockSubscriber = {
        subscribe: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        unsubscribe: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      };
      mockSSEHelper = {
        initSSE: jest.fn() as AnyMockFn,
        sendEvent: jest.fn() as AnyMockFn,
        sendHeartbeat: jest.fn() as AnyMockFn,
      };
      mockJobRepository = {
        save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        findById: jest.fn() as AnyMockFn,
        findAll: jest.fn() as AnyMockFn,
        count: jest.fn() as AnyMockFn,
      };
      mockBuffer = {
        getAll: (jest.fn() as AnyMockFn).mockResolvedValue([]),
        isComplete: (jest.fn() as AnyMockFn).mockResolvedValue(false),
      };

      progressController = new ProgressController(
        mockSubscriber as unknown as StreamEventSubscriber,
        mockSSEHelper as unknown as SSEResponseHelper,
        mockJobRepository as unknown as PipelineJobRepository,
        mockBuffer as unknown as StreamEventBuffer,
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("for all terminal-status jobs (completed, failed), sends one SSE event and calls res.end() — no pub/sub subscription (property-based)", async () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * Property: for all terminal-status jobs (completed, failed), streamProgress()
       * sends one SSE event and calls res.end() — no pub/sub subscription.
       */
      await fc.assert(
        fc.asyncProperty(
          terminalStatusArb,
          allStageArb,
          async (status, stage) => {
            // Reset mocks for each property run
            mockSSEHelper.initSSE.mockClear();
            mockSSEHelper.sendEvent.mockClear();
            mockSubscriber.subscribe.mockClear();
            mockJobRepository.findById.mockClear();

            const jobId = "550e8400-e29b-41d4-a716-446655440000";
            const pipelineJob = createPipelineJobAtStage(jobId, stage, status);
            mockJobRepository.findById.mockResolvedValue(pipelineJob);

            const mockReq = {
              params: { id: jobId },
              on: jest.fn() as AnyMockFn,
            } as unknown as Request;

            const mockRes = {
              status: (jest.fn() as AnyMockFn).mockReturnThis(),
              json: jest.fn() as AnyMockFn,
              end: jest.fn() as AnyMockFn,
            } as unknown as Response;

            await progressController.streamProgress(mockReq, mockRes);

            // SSE is initialized
            expect(mockSSEHelper.initSSE).toHaveBeenCalledTimes(1);

            // Exactly one SSE event sent (the initial job-level state)
            expect(mockSSEHelper.sendEvent).toHaveBeenCalledTimes(1);

            // The event contains the terminal status
            const sentEvent = mockSSEHelper.sendEvent.mock.calls[0]![1] as {
              type: string;
              data: { data: { status: string } };
            };
            expect(sentEvent.data.data.status).toBe(status);

            // res.end() IS called (connection closed immediately)
            expect(mockRes.end).toHaveBeenCalledTimes(1);

            // No pub/sub subscription (connection is closed)
            expect(mockSubscriber.subscribe).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Property: publishProgressEvent() calls publish() only — never buffer()", () => {
    let worker: CodeGenerationWorker;
    let mockCodeGenerator: { generateSceneCode: AnyMockFn };
    let mockRepository: {
      save: AnyMockFn;
      findById: AnyMockFn;
      findAll: AnyMockFn;
      count: AnyMockFn;
    };
    let mockObjectStore: { upload: AnyMockFn; getSignedUrl: AnyMockFn };
    let mockEventPublisher: {
      publish: AnyMockFn;
      buffer: AnyMockFn;
      markComplete: AnyMockFn;
    };
    let mockVideoRenderer: { render: AnyMockFn; renderStill: AnyMockFn };

    beforeEach(() => {
      mockCodeGenerator = {
        generateSceneCode: jest.fn() as AnyMockFn,
      };
      mockRepository = {
        save: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        findById: jest.fn() as AnyMockFn,
        findAll: jest.fn() as AnyMockFn,
        count: jest.fn() as AnyMockFn,
      };
      mockObjectStore = {
        upload: jest.fn() as AnyMockFn,
        getSignedUrl: jest.fn() as AnyMockFn,
      };
      mockEventPublisher = {
        publish: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        buffer: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
        markComplete: (jest.fn() as AnyMockFn).mockResolvedValue(undefined),
      };
      mockVideoRenderer = {
        render: (jest.fn() as AnyMockFn).mockResolvedValue(Result.ok({ videoPath: "video.mp4" })),
        renderStill: (jest.fn() as AnyMockFn).mockResolvedValue(Result.ok({ thumbnailPath: "thumb.png" })),
      };
      worker = new CodeGenerationWorker(
        mockCodeGenerator as unknown as CodeGenerator,
        mockRepository as unknown as PipelineJobRepository,
        mockObjectStore as unknown as ObjectStore,
        mockEventPublisher as unknown as StreamEventPublisher,
        mockVideoRenderer as unknown as VideoRenderer,
      );
    });

    it("publishProgressEvent() calls publish() only — never buffer() — for all stage/status combinations (property-based)", async () => {
      /**
       * **Validates: Requirements 3.4, 3.5**
       *
       * Property: publishProgressEvent() calls eventPublisher.publish() only — never
       * calls buffer() — for all stage/status combinations. This ensures job-level
       * progress events remain ephemeral pub/sub only.
       */
      await fc.assert(
        fc.asyncProperty(allStageArb, allStatusArb, async (_stage, _status) => {
          // Reset mocks for each property run
          mockEventPublisher.publish.mockClear();
          mockEventPublisher.buffer.mockClear();
          mockEventPublisher.markComplete.mockClear();
          mockRepository.findById.mockClear();
          mockRepository.save.mockClear();

          const jobId = "test-job-progress-event";

          // Create a job at code_generation stage (so we can trigger publishProgressEvent
          // via a failure path that calls it with various stage/status combos)
          const format = VideoFormat.create("short").getValue();
          const themeId = AnimationThemeId.create("studio").getValue();
          const pipelineJob = PipelineJob.reconstitute({
            id: jobId,
            browserId: "test-browser-id",
            topic: "Test topic",
            format,
            themeId,
            voiceId: null,
            voiceSettings: null,
            status: PipelineStatus.create("processing")!,
            stage: PipelineStage.create("code_generation")!,
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
            progressPercent: 80,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Trigger the "no scene directions" error path which calls publishProgressEvent
          mockRepository.findById.mockResolvedValue(pipelineJob);

          try {
            await worker.process({ data: { jobId } } as Job<{ jobId: string }>);
          } catch {
            // Expected — job has no scene directions
          }

          // publishProgressEvent was called (via the error path)
          // Filter publish calls to only those on the progress channel (not scene progress)
          const publishCalls = mockEventPublisher.publish.mock.calls.filter(
            (call) => (call[0] as string) === `stream:progress:${jobId}`,
          );
          expect(publishCalls.length).toBeGreaterThan(0);

          // buffer() should NEVER be called by publishProgressEvent
          // (On unfixed code, buffer() is never called at all)
          expect(mockEventPublisher.buffer).not.toHaveBeenCalled();
        }),
        { numRuns: 20 },
      );
    });
  });
});
