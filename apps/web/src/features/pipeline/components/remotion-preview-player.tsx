"use client";

import type React from "react";
import { useCallback, useMemo } from "react";
import { Player } from "@remotion/player";
import { Audio } from "remotion";
import type { ScenePlan } from "@video-ai/shared";

export interface RemotionPreviewPlayerProps {
  component: React.ComponentType<{ scenePlan: ScenePlan }>;
  scenePlan: ScenePlan;
  audioUrl: string | null;
  fps: number;
  totalFrames: number;
  compositionWidth: number;
  compositionHeight: number;
}

interface CompositionProps {
  scenePlan: ScenePlan;
  audioUrl: string | null;
  MainComponent: React.ComponentType<{ scenePlan: ScenePlan }>;
}

function CompositionWrapper({ scenePlan, audioUrl, MainComponent }: CompositionProps) {
  return (
    <>
      <MainComponent scenePlan={scenePlan} />
      {audioUrl && <Audio src={audioUrl} />}
    </>
  );
}

export function RemotionPreviewPlayer({
  component,
  scenePlan,
  audioUrl,
  fps,
  totalFrames,
  compositionWidth,
  compositionHeight,
}: RemotionPreviewPlayerProps) {
  const Composition = useCallback(
    () => (
      <CompositionWrapper
        scenePlan={scenePlan}
        audioUrl={audioUrl}
        MainComponent={component}
      />
    ),
    [scenePlan, audioUrl, component],
  );

  const inputProps = useMemo(
    () => ({ scenePlan, audioUrl, MainComponent: component }),
    [scenePlan, audioUrl, component],
  );

  return (
    <Player
      component={Composition}
      inputProps={inputProps}
      durationInFrames={Math.max(1, totalFrames)}
      fps={fps}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      controls
      style={{ width: "100%", maxHeight: "70vh" }}
    />
  );
}
