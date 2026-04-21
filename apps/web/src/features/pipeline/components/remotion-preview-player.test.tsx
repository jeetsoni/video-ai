import { jest } from "@jest/globals";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { RemotionPreviewPlayer } from "./remotion-preview-player";
import type { ScenePlan } from "@video-ai/shared";

// Mock @remotion/google-fonts modules
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

// Mock remotion modules since they won't work in jsdom
jest.mock("remotion", () => ({
  Audio: (props: Record<string, unknown>) => {
    // Render a plain <audio> element so we can fire events on it
    return React.createElement("audio", {
      src: props.src,
      onError: props.onError,
      "data-testid": "remotion-audio",
    });
  },
  AbsoluteFill: ({ children }: { children: React.ReactNode }) => {
    return React.createElement(
      "div",
      { "data-testid": "absolute-fill" },
      children,
    );
  },
  prefetch: () => ({
    free: () => {},
    waitUntilDone: () => Promise.resolve(),
  }),
}));

jest.mock("@remotion/player", () => ({
  Player: (props: Record<string, unknown>) => {
    // Render the component prop to test CompositionWrapper behavior
    const Component = props.component as React.ComponentType<
      Record<string, unknown>
    >;
    const inputProps = props.inputProps as Record<string, unknown>;
    return Component ? React.createElement(Component, inputProps) : null;
  },
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

const MockMainComponent: React.ComponentType<{ scenePlan: ScenePlan }> = ({
  scenePlan,
}) =>
  React.createElement(
    "div",
    { "data-testid": "main-component" },
    scenePlan.title,
  );

describe("RemotionPreviewPlayer — Bug Condition Exploration", () => {
  /**
   * Bug Condition 2: Audio load error
   *
   * Validates: Requirements 1.3, 1.5
   *
   * The CompositionWrapper renders <Audio src={audioUrl} /> with NO onError
   * handler. When the audio resource fails to load (expired URL, network error),
   * the failure is swallowed silently. The expected behavior is that an
   * onAudioError callback is invoked when the audio element fires an error event.
   *
   * This test MUST FAIL on unfixed code — no onError handler exists on <Audio>,
   * and RemotionPreviewPlayer does not accept an onAudioError prop.
   */
  it("should invoke onAudioError callback when the audio element fires an error event", async () => {
    const onAudioError = jest.fn();

    const { getByTestId } = render(
      React.createElement(RemotionPreviewPlayer, {
        component: MockMainComponent,
        scenePlan: mockScenePlan,
        audioUrl:
          "https://minio.example.com/audio/expired.mp3?X-Amz-Expires=3600",
        fps: 30,
        totalFrames: 900,
        compositionWidth: 1080,
        compositionHeight: 1920,
        onAudioError: onAudioError,
      } as any),
    );

    // Wait for audio prefetch to complete and player to render
    await waitFor(() => {
      expect(getByTestId("remotion-audio")).toBeInTheDocument();
    });

    // Find the audio element rendered by the mocked Audio component
    const audioElement = getByTestId("remotion-audio");

    // Fire an error event on the audio element (simulating a load failure)
    fireEvent.error(audioElement);

    // Expected: onAudioError callback should have been invoked
    // Bug: CompositionWrapper has no onError handler on <Audio>,
    //       and RemotionPreviewPlayer doesn't accept onAudioError prop
    expect(onAudioError).toHaveBeenCalledTimes(1);
  });
});

import fc from "fast-check";

describe("RemotionPreviewPlayer — Preservation Property Tests", () => {
  /**
   * Preservation Property: For all valid audioUrl values,
   * CompositionWrapper renders an <Audio> element with the correct src attribute.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("renders <Audio> element with correct src for all valid audioUrl values (property)", async () => {
    const validAudioUrlArb = fc
      .webUrl()
      .map((url) => `${url}/audio.mp3?X-Amz-Expires=3600`);

    await fc.assert(
      fc.asyncProperty(validAudioUrlArb, async (audioUrl) => {
        const { getByTestId, unmount } = render(
          React.createElement(RemotionPreviewPlayer, {
            component: MockMainComponent,
            scenePlan: mockScenePlan,
            audioUrl,
            fps: 30,
            totalFrames: 900,
            compositionWidth: 1080,
            compositionHeight: 1920,
          }),
        );

        await waitFor(() => {
          expect(getByTestId("remotion-audio")).toBeInTheDocument();
        });

        const audioElement = getByTestId("remotion-audio");
        expect(audioElement).toHaveAttribute("src", audioUrl);

        unmount();
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Preservation: When audioUrl is null, no <Audio> element is rendered.
   *
   * **Validates: Requirements 3.1**
   */
  it("does not render <Audio> element when audioUrl is null", () => {
    const { queryByTestId } = render(
      React.createElement(RemotionPreviewPlayer, {
        component: MockMainComponent,
        scenePlan: mockScenePlan,
        audioUrl: null,
        fps: 30,
        totalFrames: 900,
        compositionWidth: 1080,
        compositionHeight: 1920,
      }),
    );

    expect(queryByTestId("remotion-audio")).not.toBeInTheDocument();
  });
});
