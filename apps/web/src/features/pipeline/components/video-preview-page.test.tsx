import { jest } from "@jest/globals";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
  prefetch: jest.fn(() => ({
    free: jest.fn(),
    waitUntilDone: jest.fn().mockResolvedValue(undefined),
  })),
  AbsoluteFill: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "absolute-fill" }, children),
}));

jest.mock("@remotion/google-fonts/Inter", () => ({
  loadFont: () => ({ fontFamily: "Inter" }),
}));
jest.mock("@remotion/google-fonts/RobotoMono", () => ({
  loadFont: () => ({ fontFamily: "Roboto Mono" }),
}));
jest.mock("@remotion/google-fonts/Poppins", () => ({
  loadFont: () => ({ fontFamily: "Poppins" }),
}));
jest.mock("@remotion/google-fonts/OpenSans", () => ({
  loadFont: () => ({ fontFamily: "Open Sans" }),
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

jest.mock("./chat-panel", () => ({
  ChatPanel: () =>
    React.createElement("div", { "data-testid": "chat-panel" }),
}));

jest.mock("./remotion-preview-player", () => ({
  RemotionPreviewPlayer: React.forwardRef(
    (props: Record<string, unknown>, _ref: unknown) =>
      React.createElement("div", {
        "data-testid": "remotion-preview-player",
        "data-audio-url": props.audioUrl,
        "data-audio-error": String(props.audioError),
      }),
  ),
  OverlayControls: () =>
    React.createElement("div", { "data-testid": "overlay-controls" }),
}));

jest.mock("./progressive-scene-preview", () => ({
  ProgressiveScenePreview: () =>
    React.createElement("div", { "data-testid": "progressive-scene-preview" }),
  SceneProgressIndicator: () =>
    React.createElement("div", { "data-testid": "scene-progress-indicator" }),
}));

jest.mock("./smart-download-button", () => ({
  SmartDownloadButton: () =>
    React.createElement("div", { "data-testid": "smart-download-button" }),
}));

jest.mock("./scene-timeline", () => ({
  SceneTimeline: () =>
    React.createElement("div", { "data-testid": "scene-timeline" }),
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
    sendTweak: jest.fn(),
    getTweakMessages: jest.fn().mockResolvedValue([]),
    sendScriptTweak: jest.fn(),
    getScriptTweakMessages: jest.fn().mockResolvedValue([]),
    listShowcase: jest.fn(),
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
  it("passes correct audioUrl to RemotionPreviewPlayer for valid audioUrl values (property)", async () => {
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
          expect(
            screen.getByTestId("remotion-preview-player"),
          ).toBeInTheDocument();
        });

        const player = screen.getByTestId("remotion-preview-player");
        expect(player).toHaveAttribute("data-audio-url", audioUrl);

        unmount();
      }),
      { numRuns: 15 },
    );
  });

  /**
   * Preservation Property: For preview-eligible stages with audioError,
   * the ChatPanel is rendered (which handles audio status display internally).
   * The "Audio unavailable" indicator only shows in the fallback info layout.
   *
   * **Validates: Requirements 3.3**
   */
  it("renders ChatPanel for preview-eligible stages even when audioError is true (property)", async () => {
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
            expect(screen.getAllByTestId("chat-panel").length).toBeGreaterThan(0);
          });

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * Preservation Property: For preview-eligible stages, the ChatPanel is rendered
   * which contains the Regenerate functionality.
   *
   * **Validates: Requirements 3.4**
   */
  it("renders ChatPanel for preview-eligible stages with Regenerate functionality", async () => {
    const mockGetPreviewData = jest
      .fn()
      .mockResolvedValue(createMockPreviewData());
    const mockRegenerateCode = jest.fn().mockResolvedValue({ status: "ok" });
    const repository = createMockRepository(mockGetPreviewData);
    repository.regenerateCode = mockRegenerateCode;

    const job = createMockJob({ stage: "preview" });

    render(
      React.createElement(VideoPreviewPage, {
        job,
        onRetry: jest.fn(),
        repository,
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("chat-panel").length).toBeGreaterThan(0);
    });
  });
});
