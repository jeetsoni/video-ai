/**
 * Bug Condition Exploration Test — Scene Progress Events Lost on Reconnect During Code Generation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 *
 * This test encodes the EXPECTED (correct) behavior:
 * - publishSceneProgress() should call buffer() for each scene progress event
 * - streamProgress() should replay buffered scene progress events during code_generation
 *
 * On UNFIXED code, these tests FAIL — confirming the bug exists.
 * After the fix, these tests PASS — confirming the bug is resolved.
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
  StreamEventBuffer,
  StreamEventSubscriber,
  SSEResponseHelper,
} from "@/shared/infrastructure/streaming/interfaces.js";
import type {
  WordTimestamp,
  SceneBoundary,
  SceneDirection,
  ProgressEvent,
} from "@video-ai/shared";
import type { VideoRenderer } from "@/pipeline/application/interfaces/video-renderer.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { CodeGenerationWorker } from "@/pipeline/infrastructure/queue/workers/code-generation.worker.js";
import { ProgressController } from "@/pipeline/presentation/controllers/progress.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// --- Helpers ---

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

const FPS = 30;

function makeSampleDirection(
  scene: SceneBoundary,
  words: WordTimestamp[],
): SceneDirection {
  return {
    id: scene.id,
    name: scene.name,
    type: scene.type,
    description: "energetic",
    startTime: scene.startTime,
    endTime: scene.endTime,
    startFrame: Math.round(scene.startTime * FPS),
    endFrame: Math.round(scene.endTime * FPS),
    durationFrames:
      Math.round(scene.endTime * FPS) - Math.round(scene.startTime * FPS),
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
    sampleTranscript.filter(
      (w) =>
        w.start >= sampleScenePlan[0]!.startTime &&
        w.end <= sampleScenePlan[0]!.endTime,
    ),
  ),
  makeSampleDirection(
    sampleScenePlan[1]!,
    sampleTranscript.filter(
      (w) =>
        w.start >= sampleScenePlan[1]!.startTime &&
        w.end <= sampleScenePlan[1]!.endTime,
    ),
  ),
];

function createPipelineJobAtCodeGenerationStage(id: string): PipelineJob {
  const format = VideoFormat.create("short").getValue();
  const themeId = AnimationThemeId.create("studio").getValue();
  const job = PipelineJob.create({
    id,
    topic: "Test topic",
    browserId: "test-browser-id",
    format,
    themeId,
  });
  job.setScript("Generated script content", [
    {
      id: 1,
      name: "Hook",
      type: "Hook" as const,
      startTime: 0,
      endTime: 0,
      text: "Generated script content",
    },
  ]);
  job.transitionTo("script_review");
  job.setApprovedScript("Approved script content", [
    {
      id: 1,
      name: "Hook",
      type: "Hook" as const,
      startTime: 0,
      endTime: 0,
      text: "Approved script content",
    },
  ]);
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

// --- fast-check arbitraries for scene progress events ---

const sceneStatusArb = fc.constantFrom(
  "generating" as const,
  "completed" as const,
  "failed" as const,
);

const sceneProgressArb = fc.record({
  sceneId: fc.integer({ min: 1, max: 100 }),
  sceneName: fc.stringOf(
    fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
    { minLength: 1, maxLength: 30 },
  ),
  status: sceneStatusArb,
  code: fc.option(
    fc.stringOf(
      fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
      { minLength: 10, maxLength: 100 },
    ),
    { nil: undefined },
  ),
});

const sceneProgressListArb = fc.array(sceneProgressArb, {
  minLength: 1,
  maxLength: 10,
});

// --- Tests ---

describe("Bug Condition Exploration: Scene Progress Events Lost on Reconnect", () => {
  describe("Part 1: CodeGenerationWorker.publishSceneProgress() should buffer events", () => {
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
        upload: (jest.fn() as AnyMockFn).mockResolvedValue(
          Result.ok("code/job-1.tsx"),
        ),
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

    it("should call buffer() with key stream:buffer:scene-progress:{jobId} for each scene progress event (property-based)", async () => {
      /**
       * **Validates: Requirements 1.3, 2.3**
       *
       * Property: For any set of scene progress events published during code generation,
       * each event should be buffered to stream:buffer:scene-progress:{jobId}.
       *
       * On unfixed code: buffer() is NEVER called → test FAILS (confirms root cause part 1)
       */
      await fc.assert(
        fc.asyncProperty(sceneProgressListArb, async (sceneProgressEvents) => {
          // Reset mocks for each property run
          mockEventPublisher.publish.mockClear();
          mockEventPublisher.buffer.mockClear();
          mockEventPublisher.markComplete.mockClear();
          mockCodeGenerator.generateSceneCode.mockClear();
          mockRepository.save.mockClear();
          mockObjectStore.upload.mockResolvedValue(Result.ok("code/job-1.tsx"));

          const jobId = "test-job-buffer";

          // Build scene directions from the generated scene progress events
          const directions: SceneDirection[] = sceneProgressEvents.map((sp) =>
            makeSampleDirection(
              {
                id: sp.sceneId,
                name: sp.sceneName,
                type: "Hook",
                startTime: 0,
                endTime: 1.0,
                text: `Scene ${sp.sceneName}`,
              },
              [{ word: "test", start: 0, end: 0.5 }],
            ),
          );

          // Mock code generator to return code for each scene
          mockCodeGenerator.generateSceneCode.mockResolvedValue(
            Result.ok("function Main({ scene }) { return <div>Hello</div>; }"),
          );

          // Create a pipeline job at code_generation stage with our directions
          const pipelineJob = createPipelineJobAtCodeGenerationStage(jobId);
          // Override scene directions with our generated ones (bypass stage check for test)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pipelineJob as any).props.sceneDirections = directions;
          mockRepository.findById.mockResolvedValue(pipelineJob);

          await worker.process(createMockJob(jobId));

          // Each scene should have 2 publish calls (generating + completed) and 2 buffer calls
          const bufferCalls = mockEventPublisher.buffer.mock.calls;
          const expectedBufferKey = `stream:buffer:scene-progress:${jobId}`;

          // The key assertion: buffer() must be called for each scene progress event
          // On unfixed code, buffer() is never called, so this will be 0
          expect(bufferCalls.length).toBeGreaterThanOrEqual(directions.length);

          // Every buffer call should use the correct key
          for (const call of bufferCalls) {
            expect(call[0]).toBe(expectedBufferKey);
          }

          // Each buffer call should contain a valid scene progress event
          for (const call of bufferCalls) {
            const event = call[1] as ProgressEvent;
            expect(event.type).toBe("progress");
            expect(event.data.stage).toBe("code_generation");
            expect(event.data.sceneProgress).toBeDefined();
            expect(event.data.sceneProgress!.sceneId).toBeDefined();
            expect(event.data.sceneProgress!.sceneName).toBeDefined();
            expect(["generating", "completed", "failed"]).toContain(
              event.data.sceneProgress!.status,
            );
          }
        }),
        { numRuns: 20 },
      );
    });
  });

  describe("Part 2: ProgressController.streamProgress() should replay buffered scene progress", () => {
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

    it("should replay buffered scene progress events via SSE for code_generation jobs (property-based)", async () => {
      /**
       * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
       *
       * Property: For any code_generation job with buffered scene progress events,
       * streamProgress() should call buffer.getAll() on stream:buffer:scene-progress:{jobId}
       * and send each buffered event via SSE before subscribing to pub/sub.
       *
       * On unfixed code: ProgressController has no StreamEventBuffer dependency
       * and no replay logic → test FAILS (confirms root cause part 2)
       */
      await fc.assert(
        fc.asyncProperty(sceneProgressListArb, async (sceneProgressEvents) => {
          // Reset mocks
          mockSSEHelper.sendEvent.mockClear();
          mockSubscriber.subscribe.mockClear();
          mockJobRepository.findById.mockClear();
          mockBuffer.getAll.mockClear();

          const jobId = "550e8400-e29b-41d4-a716-446655440000";

          // Build buffered events as JSON strings (as they'd be stored in Redis)
          const bufferedEvents = sceneProgressEvents.map((sp, idx) => {
            const event: ProgressEvent = {
              type: "progress",
              seq: idx + 1,
              data: {
                stage: "code_generation",
                status: "processing",
                progressPercent: 80,
                sceneProgress: {
                  sceneId: sp.sceneId,
                  sceneName: sp.sceneName,
                  status: sp.status,
                  ...(sp.code ? { code: sp.code } : {}),
                },
              },
            };
            return JSON.stringify(event);
          });

          // Mock buffer to return the buffered events
          mockBuffer.getAll.mockResolvedValue(bufferedEvents);

          // Create a pipeline job at code_generation stage
          const pipelineJob = createPipelineJobAtCodeGenerationStage(jobId);
          mockJobRepository.findById.mockResolvedValue(pipelineJob);

          // Create mock request/response
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

          // The controller should have a buffer dependency and call getAll()
          // On unfixed code, there is no buffer dependency, so we check if
          // the controller attempts to replay scene progress events.
          //
          // We verify by checking that sendEvent was called with scene progress data
          // AFTER the initial job-level event and BEFORE pub/sub subscription.
          const sendEventCalls = mockSSEHelper.sendEvent.mock.calls;

          // First call is the initial job-level progress event
          expect(sendEventCalls.length).toBeGreaterThan(0);

          // On the fixed code, we expect 1 (initial) + N (buffered scene progress) sendEvent calls
          // before subscribe is called. On unfixed code, only 1 call (initial) is made.
          const expectedTotalCalls = 1 + sceneProgressEvents.length;
          expect(sendEventCalls.length).toBeGreaterThanOrEqual(
            expectedTotalCalls,
          );

          // Verify each buffered scene progress event was sent via SSE
          for (let i = 0; i < sceneProgressEvents.length; i++) {
            const call = sendEventCalls[i + 1]; // +1 to skip initial job-level event
            expect(call).toBeDefined();
            const sentEvent = call![1] as { type: string; data: ProgressEvent };
            expect(sentEvent.data.data.sceneProgress).toBeDefined();
            expect(sentEvent.data.data.sceneProgress!.sceneId).toBe(
              sceneProgressEvents[i]!.sceneId,
            );
            expect(sentEvent.data.data.sceneProgress!.sceneName).toBe(
              sceneProgressEvents[i]!.sceneName,
            );
          }
        }),
        { numRuns: 20 },
      );
    });
  });
});
