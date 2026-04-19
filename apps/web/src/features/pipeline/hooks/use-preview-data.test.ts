import { jest } from "@jest/globals";
import { renderHook, waitFor, act } from "@testing-library/react";
import fc from "fast-check";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import type { PreviewDataResponse } from "../types/pipeline.types";
import type { PipelineStage } from "@video-ai/shared";
import { usePreviewData } from "./use-preview-data";

// Mock the code evaluator since it uses new Function() which won't work in jsdom
jest.mock("../utils/code-evaluator", () => ({
  evaluateComponentCode: jest.fn(() => ({
    component: () => null,
    error: null,
  })),
}));

// --- Helpers ---

function createMockPreviewData(
  overrides: Partial<PreviewDataResponse> = {},
): PreviewDataResponse {
  return {
    code: "function Main({ scenePlan }) { return null; }",
    scenePlan: {
      title: "Test Video",
      totalDuration: 30,
      fps: 30,
      totalFrames: 900,
      designSystem: {
        background: "#000",
        surface: "#111",
        raised: "#222",
        textPrimary: "#fff",
        textMuted: "#aaa",
        accents: {
          hookFear: "#f00",
          wrongPath: "#0f0",
          techCode: "#00f",
          revelation: "#ff0",
          cta: "#0ff",
          violet: "#f0f",
        },
      },
      scenes: [],
    },
    audioUrl: "https://minio.example.com/audio/test.mp3?X-Amz-Expires=3600",
    audioError: false,
    format: "reel",
    fps: 30,
    totalFrames: 900,
    compositionWidth: 1080,
    compositionHeight: 1920,
    ...overrides,
  };
}

function createMockRepository(
  getPreviewDataFn?: jest.Mock,
): PipelineRepository {
  return {
    createJob: jest.fn(),
    getJobStatus: jest.fn(),
    approveScript: jest.fn(),
    regenerateScript: jest.fn(),
    regenerateCode: jest.fn(),
    listJobs: jest.fn(),
    getThemes: jest.fn(),
    getPreviewData: getPreviewDataFn ?? jest.fn(),
    exportVideo: jest.fn(),
    listVoices: jest.fn(),
  };
}

describe("usePreviewData — Bug Condition Exploration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Bug Condition 1: Stale URL (urlAgeSeconds >= 3600)
   *
   * Validates: Requirements 1.1, 1.2
   *
   * The usePreviewData hook fetches preview data once on mount but never
   * re-fetches. After 3600+ seconds, the signed audio URL expires and
   * audio silently fails. The expected behavior is that the hook triggers
   * a re-fetch before the URL expires.
   *
   * This test MUST FAIL on unfixed code — no re-fetch mechanism exists.
   */
  it("should re-fetch preview data when the audio URL becomes stale (>= 3600s)", async () => {
    const mockGetPreviewData = jest.fn().mockResolvedValue(
      createMockPreviewData({
        audioUrl: "https://minio.example.com/audio/test.mp3?X-Amz-Expires=3600",
      }),
    );
    const repository = createMockRepository(mockGetPreviewData);

    const { result } = renderHook(() =>
      usePreviewData({
        repository,
        jobId: "job-123",
        stage: "preview",
      }),
    );

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetPreviewData).toHaveBeenCalledTimes(1);

    // Advance time by 3600 seconds (1 hour) — the signed URL expiry
    await act(async () => {
      jest.advanceTimersByTime(3600 * 1000);
    });

    // Expected: hook should have re-fetched to get a fresh signed URL
    // Bug: usePreviewData never re-fetches after initial mount
    expect(mockGetPreviewData).toHaveBeenCalledTimes(2);
  });

  /**
   * Bug Condition 3: Late TTS (audioUrl is null, TTS not yet complete)
   *
   * Validates: Requirements 1.4, 1.5
   *
   * When TTS generation completes after the user is already on a
   * preview-eligible stage, the audioUrl in the initial fetch is null.
   * The hook never re-fetches, so the newly available audio is invisible
   * until a manual page refresh. The expected behavior is that the hook
   * polls for the audio URL when it's null.
   *
   * This test MUST FAIL on unfixed code — no null-audio polling exists.
   */
  it("should poll for audio URL when audioUrl is null and audioError is false (late TTS)", async () => {
    const mockGetPreviewData = jest.fn().mockResolvedValue(
      createMockPreviewData({
        audioUrl: null,
        audioError: false,
      }),
    );
    const repository = createMockRepository(mockGetPreviewData);

    const { result } = renderHook(() =>
      usePreviewData({
        repository,
        jobId: "job-456",
        stage: "preview",
      }),
    );

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetPreviewData).toHaveBeenCalledTimes(1);
    expect(result.current.previewData?.audioUrl).toBeNull();

    // Advance time by 10 seconds — the expected null-audio poll interval
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    // Expected: hook should have polled again to check for audio URL
    // Bug: usePreviewData never re-fetches when audioUrl is null
    expect(mockGetPreviewData).toHaveBeenCalledTimes(2);

    // Advance another 10 seconds to confirm continued polling
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    // Expected: hook should have polled a third time
    expect(mockGetPreviewData).toHaveBeenCalledTimes(3);
  });
});

// --- Arbitraries for property-based tests ---

const NON_PREVIEW_STAGES: PipelineStage[] = [
  "script_generation",
  "script_review",
  "tts_generation",
  "transcription",
  "timestamp_mapping",
  "direction_generation",
  "code_generation",
];

const PREVIEW_ELIGIBLE_STAGES: PipelineStage[] = [
  "preview",
  "rendering",
  "done",
];

const validAudioUrlArb = fc
  .webUrl()
  .map((url) => `${url}/audio.mp3?X-Amz-Expires=3600`);

const validPreviewDataArb = fc.record({
  audioUrl: validAudioUrlArb,
  code: fc.constant("function Main({ scenePlan }) { return null; }"),
  fps: fc.constant(30),
  totalFrames: fc.integer({ min: 1, max: 9000 }),
  compositionWidth: fc.constantFrom(1080, 1920),
  compositionHeight: fc.constantFrom(1920, 1080),
  format: fc.constantFrom(
    "reel" as const,
    "short" as const,
    "longform" as const,
  ),
  audioError: fc.constant(false),
  scenePlan: fc.constant({
    title: "Test",
    totalDuration: 30,
    fps: 30 as const,
    totalFrames: 900,
    designSystem: {
      background: "#000",
      surface: "#111",
      raised: "#222",
      textPrimary: "#fff",
      textMuted: "#aaa",
      accents: {
        hookFear: "#f00",
        wrongPath: "#0f0",
        techCode: "#00f",
        revelation: "#ff0",
        cta: "#0ff",
        violet: "#f0f",
      },
    },
    scenes: [],
  }),
});

describe("usePreviewData — Preservation Property Tests", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Preservation Property: For all valid audioUrl strings (non-null, fresh),
   * usePreviewData returns the same previewData from the initial fetch
   * without triggering additional fetches within the first 30 minutes.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("returns previewData from initial fetch without additional fetches within 30 minutes (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPreviewDataArb,
        fc.constantFrom(...PREVIEW_ELIGIBLE_STAGES),
        async (previewData, stage) => {
          const mockGetPreviewData = jest.fn().mockResolvedValue(previewData);
          const repository = createMockRepository(mockGetPreviewData);

          const { result, unmount } = renderHook(() =>
            usePreviewData({ repository, jobId: "job-prop-1", stage }),
          );

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // Initial fetch happened exactly once
          expect(mockGetPreviewData).toHaveBeenCalledTimes(1);

          // previewData matches what the repository returned
          expect(result.current.previewData?.audioUrl).toBe(
            previewData.audioUrl,
          );
          expect(result.current.previewData?.scenePlan).toEqual(
            previewData.scenePlan,
          );
          expect(result.current.evaluatedComponent).not.toBeNull();
          expect(result.current.error).toBeNull();

          // Advance time by 29 minutes (just under the 30-minute refresh threshold)
          await act(async () => {
            jest.advanceTimersByTime(29 * 60 * 1000);
          });

          // No additional fetches should have occurred
          expect(mockGetPreviewData).toHaveBeenCalledTimes(1);

          unmount();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Preservation Property: For all non-preview-eligible stages,
   * usePreviewData does not call repository.getPreviewData.
   *
   * **Validates: Requirements 3.6**
   */
  it("does not fetch preview data for non-preview-eligible stages (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_PREVIEW_STAGES),
        fc.uuid(),
        async (stage, jobId) => {
          const mockGetPreviewData = jest
            .fn()
            .mockResolvedValue(createMockPreviewData());
          const repository = createMockRepository(mockGetPreviewData);

          const { result, unmount } = renderHook(() =>
            usePreviewData({ repository, jobId, stage }),
          );

          // Give any potential async operations time to settle
          await act(async () => {
            jest.advanceTimersByTime(100);
          });

          // No fetch should have been triggered
          expect(mockGetPreviewData).not.toHaveBeenCalled();
          expect(result.current.previewData).toBeNull();
          expect(result.current.isLoading).toBe(false);

          unmount();
        },
      ),
      { numRuns: 20 },
    );
  });
});
