import { jest } from "@jest/globals";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fc from "fast-check";
import type { PipelineJobDto, ScenePlan } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import type { PreviewDataResponse } from "../types/pipeline.types";
import { VideoPreviewPage } from "./video-preview-page";

// Mock the code evaluator
jest.mock("../utils/code-evaluator", () => ({
  evaluateComponentCode: jest.fn(() => ({
    component: ({ scenePlan }: { scenePlan: ScenePlan }) =>
      React.createElement(
        "div",
        { "data-testid": "evaluated-component" },
        scenePlan.title,
      ),
    error: null,
  })),
}));

// Mock remotion modules
jest.mock("remotion", () => ({
  Audio: (props: Record<string, unknown>) =>
    React.createElement("audio", {
      src: props.src,
      "data-testid": "remotion-audio",
    }),
}));

jest.mock("@remotion/player", () => ({
  Player: (props: Record<string, unknown>) => {
    const Component = props.component as React.ComponentType<
      Record<string, unknown>
    >;
    const inputProps = props.inputProps as Record<string, unknown>;
    return React.createElement(
      "div",
      { "data-testid": "remotion-player" },
      Component ? React.createElement(Component, inputProps) : null,
    );
  },
}));

// Mock child components that aren't relevant to these tests
jest.mock("./stage-progress-header", () => ({
  StageProgressHeader: () =>
    React.createElement("div", { "data-testid": "stage-progress-header" }),
}));

jest.mock("./stage-timeline", () => ({
  StageTimeline: () =>
    React.createElement("div", { "data-testid": "stage-timeline" }),
}));

jest.mock("./video-preview-section", () => ({
  VideoPreviewSection: () =>
    React.createElement("div", { "data-testid": "video-preview-section" }),
}));

// --- Helpers ---

const mockScenePlan: ScenePlan = {
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
};

function createMockPreviewData(
  overrides: Partial<PreviewDataResponse> = {},
): PreviewDataResponse {
  return {
    code: "function Main({ scenePlan }) { return null; }",
    scenePlan: mockScenePlan,
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
    autofixCode: jest.fn(),
    retryJob: jest.fn(),
    listJobs: jest.fn(),
    getThemes: jest.fn(),
    getPreviewData: getPreviewDataFn ?? jest.fn(),
    exportVideo: jest.fn(),
    listVoices: jest.fn(),
    previewVoice: jest.fn(),
  };
}

function createMockJob(
  overrides: Partial<PipelineJobDto> = {},
): PipelineJobDto {
  return {
    id: "job-123",
    topic: "Test Topic",
    format: "reel",
    themeId: "theme-1",
    status: "processing",
    stage: "preview",
    progressPercent: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("VideoPreviewPage — Preservation Property Tests", () => {
  /**
   * Preservation Property: For all valid audioUrl values,
   * CompositionWrapper renders an <Audio> element with the correct src attribute.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("renders <Audio> element with correct src for valid audioUrl values (property)", async () => {
    const validAudioUrlArb = fc
      .webUrl()
      .map((url) => `${url}/audio.mp3?X-Amz-Expires=3600`);

    await fc.assert(
      fc.asyncProperty(validAudioUrlArb, async (audioUrl) => {
        const mockGetPreviewData = jest
          .fn()
          .mockResolvedValue(createMockPreviewData({ audioUrl }));
        const repository = createMockRepository(mockGetPreviewData);
        const job = createMockJob({ stage: "preview" });

        const { unmount } = render(
          React.createElement(VideoPreviewPage, {
            job,
            onRetry: jest.fn(),
            repository,
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId("remotion-audio")).toBeInTheDocument();
        });

        const audioElement = screen.getByTestId("remotion-audio");
        expect(audioElement).toHaveAttribute("src", audioUrl);

        unmount();
      }),
      { numRuns: 15 },
    );
  });

  /**
   * Preservation Property: Backend audioError: true continues to show
   * the "Audio unavailable" indicator regardless of any new client-side state.
   *
   * **Validates: Requirements 3.3**
   */
  it("shows 'Audio unavailable' indicator when previewData.audioError is true (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "preview" as const,
          "rendering" as const,
          "done" as const,
        ),
        async (stage) => {
          const mockGetPreviewData = jest
            .fn()
            .mockResolvedValue(createMockPreviewData({ audioError: true }));
          const repository = createMockRepository(mockGetPreviewData);
          const job = createMockJob({ stage });

          const { unmount } = render(
            React.createElement(VideoPreviewPage, {
              job,
              onRetry: jest.fn(),
              repository,
            }),
          );

          await waitFor(() => {
            expect(screen.getByText("Audio unavailable.")).toBeInTheDocument();
          });

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * Preservation Property: Regenerate button calls repository.regenerateCode(job.id)
   * without interference from any audio refresh mechanism.
   *
   * **Validates: Requirements 3.4**
   */
  it("Regenerate button calls repository.regenerateCode(job.id) correctly", async () => {
    const mockGetPreviewData = jest
      .fn()
      .mockResolvedValue(createMockPreviewData());
    const mockRegenerateCode = jest.fn().mockResolvedValue({ status: "ok" });
    const repository = createMockRepository(mockGetPreviewData);
    repository.regenerateCode = mockRegenerateCode;

    const job = createMockJob({ stage: "preview" });
    const onRefresh = jest.fn();

    render(
      React.createElement(VideoPreviewPage, {
        job,
        onRetry: jest.fn(),
        onRefresh,
        repository,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Regenerate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Regenerate"));

    await waitFor(() => {
      expect(mockRegenerateCode).toHaveBeenCalledWith("job-123");
    });
  });
});
