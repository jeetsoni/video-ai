"use client";

import type React from "react";
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Player, type PlayerRef, type ErrorFallback } from "@remotion/player";
import { Audio, prefetch } from "remotion";
import { AlertTriangle, Wand2, RefreshCw, Loader2 } from "lucide-react";
import type { ScenePlan } from "@video-ai/shared";

export interface RemotionPreviewPlayerProps {
  component: React.ComponentType<{ scenePlan: ScenePlan }>;
  scenePlan: ScenePlan;
  audioUrl: string | null;
  fps: number;
  totalFrames: number;
  compositionWidth: number;
  compositionHeight: number;
  onAudioError?: () => void;
  onAutofix?: (errorMessage: string, errorType: string) => Promise<void>;
  onRegenerate?: () => void;
  isAutofixing?: boolean;
}

interface CompositionProps {
  scenePlan: ScenePlan;
  audioUrl: string | null;
  MainComponent: React.ComponentType<{ scenePlan: ScenePlan }>;
  onAudioError?: () => void;
}

function CompositionWrapper({
  scenePlan,
  audioUrl,
  MainComponent,
  onAudioError,
}: CompositionProps) {
  return (
    <>
      <MainComponent scenePlan={scenePlan} />
      {audioUrl && (
        <Audio src={audioUrl} onError={onAudioError} pauseWhenBuffering />
      )}
    </>
  );
}

interface RuntimeErrorDisplayProps {
  error: Error;
  onAutofix?: () => void;
  onRegenerate?: () => void;
  isAutofixing?: boolean;
}

function RuntimeErrorDisplay({
  error,
  onAutofix,
  onRegenerate,
  isAutofixing,
  width,
  height,
}: RuntimeErrorDisplayProps & { width: number; height: number }) {
  const errorMessage = error.message;
  const errorType = error.name || "Runtime Error";

  const isFixableError =
    errorMessage.includes("is not defined") ||
    errorMessage.includes("ReferenceError") ||
    errorMessage.includes("TypeError") ||
    errorMessage.includes("Cannot read");

  // Calculate scale factor - the error UI is rendered at composition size
  // but we want it to appear at a readable size in the player viewport
  // Use inverse scaling to counteract the player's scaling
  const aspectRatio = width / height;
  const isVertical = aspectRatio < 1;

  // For vertical videos (reels), the player width is constrained
  // We need to scale up the UI to be readable
  const scaleFactor = isVertical
    ? Math.max(width / 400, 2.5)
    : Math.max(height / 400, 2);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(15, 15, 20, 0.95)",
        backdropFilter: "blur(8px)",
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24 * scaleFactor,
          padding: 32 * scaleFactor,
          textAlign: "center",
          maxWidth: width * 0.85,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 56 * scaleFactor,
            height: 56 * scaleFactor,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16 * scaleFactor,
            backgroundColor: "rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertTriangle
            style={{
              width: 28 * scaleFactor,
              height: 28 * scaleFactor,
              color: "#ef4444",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8 * scaleFactor,
          }}
        >
          <p
            style={{
              fontSize: 16 * scaleFactor,
              fontWeight: 600,
              color: "#ef4444",
              margin: 0,
            }}
          >
            {errorType}
          </p>
          <p
            style={{
              fontSize: 13 * scaleFactor,
              color: "rgba(255, 255, 255, 0.7)",
              lineHeight: 1.5,
              margin: 0,
              wordBreak: "break-word",
            }}
          >
            {errorMessage}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 12 * scaleFactor,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {isFixableError && onAutofix && (
            <button
              onClick={onAutofix}
              disabled={isAutofixing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8 * scaleFactor,
                padding: `${10 * scaleFactor}px ${20 * scaleFactor}px`,
                fontSize: 14 * scaleFactor,
                fontWeight: 500,
                color: "white",
                backgroundColor: isAutofixing ? "#047857" : "#059669",
                border: "none",
                borderRadius: 8 * scaleFactor,
                cursor: isAutofixing ? "not-allowed" : "pointer",
                opacity: isAutofixing ? 0.7 : 1,
              }}
            >
              {isAutofixing ? (
                <Loader2
                  style={{
                    width: 16 * scaleFactor,
                    height: 16 * scaleFactor,
                    animation: "spin 1s linear infinite",
                  }}
                />
              ) : (
                <Wand2
                  style={{ width: 16 * scaleFactor, height: 16 * scaleFactor }}
                />
              )}
              {isAutofixing ? "Fixing..." : "Autofix"}
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isAutofixing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8 * scaleFactor,
                padding: `${10 * scaleFactor}px ${20 * scaleFactor}px`,
                fontSize: 14 * scaleFactor,
                fontWeight: 500,
                color: "white",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: 8 * scaleFactor,
                cursor: isAutofixing ? "not-allowed" : "pointer",
                opacity: isAutofixing ? 0.7 : 1,
              }}
            >
              <RefreshCw
                style={{ width: 16 * scaleFactor, height: 16 * scaleFactor }}
              />
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
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
  onAudioError,
  onAutofix,
  onRegenerate,
  isAutofixing,
}: RemotionPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [audioReady, setAudioReady] = useState(!audioUrl);

  // Prefetch voiceover audio so it's buffered before playback
  useEffect(() => {
    if (!audioUrl) {
      setAudioReady(true);
      return;
    }

    setAudioReady(false);

    // Timeout fallback — don't block the player forever if prefetch is slow
    const timeout = setTimeout(() => setAudioReady(true), 4000);

    const { free, waitUntilDone } = prefetch(audioUrl, {
      method: "blob-url",
    });

    waitUntilDone()
      .then(() => {
        clearTimeout(timeout);
        setAudioReady(true);
      })
      .catch(() => {
        clearTimeout(timeout);
        setAudioReady(true);
      });

    return () => {
      clearTimeout(timeout);
      free();
    };
  }, [audioUrl]);

  // Listen for error events from the player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onError = (e: { detail: { error: Error } }) => {
      console.error("Remotion Player error event:", e.detail.error);
    };

    player.addEventListener("error", onError);
    return () => {
      player.removeEventListener("error", onError);
    };
  }, []);

  const handleAutofix = useCallback(
    async (error: Error) => {
      if (!onAutofix) return;
      const errorType = error.name || "RuntimeError";
      await onAutofix(error.message, errorType);
    },
    [onAutofix],
  );

  const errorFallback: ErrorFallback = useCallback(
    ({ error }) => {
      return (
        <RuntimeErrorDisplay
          error={error}
          onAutofix={onAutofix ? () => handleAutofix(error) : undefined}
          onRegenerate={onRegenerate}
          isAutofixing={isAutofixing}
          width={compositionWidth}
          height={compositionHeight}
        />
      );
    },
    [
      onAutofix,
      onRegenerate,
      isAutofixing,
      handleAutofix,
      compositionWidth,
      compositionHeight,
    ],
  );

  const Composition = useCallback(
    () => (
      <CompositionWrapper
        scenePlan={scenePlan}
        audioUrl={audioUrl}
        MainComponent={component}
        onAudioError={onAudioError}
      />
    ),
    [scenePlan, audioUrl, component, onAudioError],
  );

  const inputProps = useMemo(
    () => ({ scenePlan, audioUrl, MainComponent: component, onAudioError }),
    [scenePlan, audioUrl, component, onAudioError],
  );

  if (!audioReady) {
    return (
      <div
        style={{
          width: "100%",
          maxHeight: "70vh",
          aspectRatio: `${compositionWidth}/${compositionHeight}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F0F14",
          borderRadius: 8,
        }}
      >
        <Loader2
          style={{
            width: 24,
            height: 24,
            color: "rgba(255,255,255,0.5)",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <Player
      ref={playerRef}
      component={Composition}
      inputProps={inputProps}
      durationInFrames={Math.max(1, totalFrames)}
      fps={fps}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      controls
      numberOfSharedAudioTags={20}
      style={{ width: "100%", maxHeight: "70vh" }}
      errorFallback={errorFallback}
    />
  );
}
