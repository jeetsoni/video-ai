"use client";

import type React from "react";
import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
} from "react";
import { Player, type PlayerRef, type ErrorFallback } from "@remotion/player";

export type { PlayerRef } from "@remotion/player";
import { AbsoluteFill, Audio, prefetch } from "remotion";
import {
  AlertTriangle,
  Wand2,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import type { ScenePlan } from "@video-ai/shared";

// Load Google Fonts for consistent rendering between preview and export
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadRobotoMono } from "@remotion/google-fonts/RobotoMono";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadOpenSans } from "@remotion/google-fonts/OpenSans";

// Load fonts and get their CSS font-family values
const { fontFamily: interFamily } = loadInter();
const { fontFamily: monoFamily } = loadRobotoMono();
const { fontFamily: poppinsFamily } = loadPoppins();
const { fontFamily: openSansFamily } = loadOpenSans();

// CSS to apply fonts globally and override monospace
function FontStyles() {
  return (
    <style>
      {`
        * {
          font-family: ${interFamily}, ${openSansFamily}, system-ui, sans-serif;
        }
        code, pre, .monospace, [style*="monospace"] {
          font-family: ${monoFamily}, 'Courier New', monospace !important;
        }
        h1, h2, h3, .heading {
          font-family: ${poppinsFamily}, ${interFamily}, system-ui, sans-serif;
        }
      `}
    </style>
  );
}

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
  /** Callback invoked with the Remotion PlayerRef once the player mounts. */
  onPlayerRef?: (ref: PlayerRef | null) => void;
  /** Ref attached to the outermost container div, useful for screenshot capture. */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Hide the built-in overlay controls (use external OverlayControls instead). */
  hideControls?: boolean;
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
    <AbsoluteFill>
      <FontStyles />
      <MainComponent scenePlan={scenePlan} />
      {audioUrl && (
        <Audio src={audioUrl} onError={onAudioError} pauseWhenBuffering />
      )}
    </AbsoluteFill>
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

  const aspectRatio = width / height;
  const isVertical = aspectRatio < 1;
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

/** Format frame count as mm:ss */
function formatTime(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Custom glass overlay controls matching the reference design */
export function OverlayControls({
  playerRef,
  fps,
  totalFrames,
  external,
}: {
  external?: boolean;
  playerRef: React.RefObject<PlayerRef | null>;
  fps: number;
  totalFrames: number;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isDraggingRef = useRef(false);
  const currentFrameRef = useRef(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  const totalTimeStr = useMemo(() => formatTime(totalFrames, fps), [totalFrames, fps]);

  // Direct DOM update for frame — no React state, no re-renders
  const updateFrameDisplay = useCallback(
    (frame: number) => {
      currentFrameRef.current = frame;
      const pct = totalFrames > 1 ? (frame / (totalFrames - 1)) * 100 : 0;
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${pct}%`;
      }
      if (progressThumbRef.current) {
        progressThumbRef.current.style.left = `calc(${pct}% - 6px)`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(frame, fps)} / ${totalTimeStr}`;
      }
    },
    [fps, totalFrames, totalTimeStr],
  );


  const [playerReady, setPlayerReady] = useState(!!playerRef.current);
  useEffect(() => {
    if (playerRef.current) { setPlayerReady(true); return; }
    const id = setInterval(() => {
      if (playerRef.current) { setPlayerReady(true); clearInterval(id); }
    }, 100);
    return () => clearInterval(id);
  }, [playerRef]);

  // Subscribe to player events — only play/pause/mute use React state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      if (!isDraggingRef.current) updateFrameDisplay(e.detail.frame);
    };
    const onMuteChange = (e: { detail: { isMuted: boolean } }) =>
      setIsMuted(e.detail.isMuted);

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("mutechange", onMuteChange);

    // Sync initial state
    setIsPlaying(player.isPlaying());
    setIsMuted(player.isMuted());
    updateFrameDisplay(player.getCurrentFrame());

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("mutechange", onMuteChange);
    };
  }, [playerRef, playerReady, updateFrameDisplay]);

  const handleTogglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playerRef.current?.toggle(e);
    },
    [playerRef],
  );

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const player = playerRef.current;
      if (!player) return;
      if (player.isMuted()) {
        player.unmute();
      } else {
        player.mute();
      }
    },
    [playerRef],
  );

  const handleFullscreen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playerRef.current?.requestFullscreen();
    },
    [playerRef],
  );

  const seekToPosition = useCallback(
    (clientX: number) => {
      const bar = progressRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const frame = Math.round(ratio * (totalFrames - 1));
      updateFrameDisplay(frame);
      playerRef.current?.seekTo(frame);
    },
    [playerRef, totalFrames, updateFrameDisplay],
  );

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      seekToPosition(e.clientX);

      const onMouseMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
      const onMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [seekToPosition],
  );

  return (
    <div
      className={external ? "flex flex-col" : "absolute inset-x-0 bottom-0 z-20 flex flex-col"}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Glass control bar */}
      <div
        className={external ? "rounded-xl px-3 py-2.5 flex flex-col gap-2" : "mx-2 mb-2 rounded-xl px-3 py-2 flex flex-col gap-2"}
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Top row: play, duration label, time, mute, fullscreen */}
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className="flex size-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="size-3.5 text-white" />
            ) : (
              <Play className="size-3.5 text-white ml-0.5" />
            )}
          </button>

          {/* Duration label + time */}
          <div className="flex flex-col leading-none">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
              Duration
            </span>
            <span ref={timeDisplayRef} className="text-xs tabular-nums text-white/90">
              {formatTime(0, fps)} / {totalTimeStr}
            </span>
          </div>

          <div className="flex-1" />

          {/* Mute */}
          <button
            type="button"
            onClick={handleToggleMute}
            className="flex size-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="size-3.5 text-white/70" />
            ) : (
              <Volume2 className="size-3.5 text-white/70" />
            )}
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={handleFullscreen}
            className="flex size-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            aria-label="Fullscreen"
          >
            <Maximize2 className="size-3.5 text-white/70" />
          </button>
        </div>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="group relative h-1.5 cursor-pointer rounded-full bg-white/20"
          onMouseDown={handleProgressMouseDown}
          role="slider"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={totalFrames}
          tabIndex={0}
        >
          <div
            ref={progressFillRef}
            className="h-full rounded-full bg-white"
            style={{ width: "0%" }}
          />
          {/* Thumb */}
          <div
            ref={progressThumbRef}
            className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: "-6px" }}
          />
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
  onPlayerRef,
  containerRef,
  hideControls,
}: RemotionPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [audioReady, setAudioReady] = useState(!audioUrl);

  // Expose the PlayerRef to the parent via callback whenever it becomes available
  useEffect(() => {
    if (onPlayerRef) {
      onPlayerRef(playerRef.current);
    }
    return () => {
      if (onPlayerRef) {
        onPlayerRef(null);
      }
    };
  }, [onPlayerRef, audioReady]);

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
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
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
    <div ref={containerRef} className="relative" style={{ width: "100%", height: "100%" }}>
      <Player
        ref={playerRef}
        component={Composition}
        inputProps={inputProps}
        durationInFrames={Math.max(1, totalFrames)}
        fps={fps}
        compositionWidth={compositionWidth}
        compositionHeight={compositionHeight}
        controls={false}
        clickToPlay
        numberOfSharedAudioTags={40}
        style={{ width: "100%", height: "100%" }}
        errorFallback={errorFallback}
      />
      {!hideControls && (<OverlayControls
        playerRef={playerRef}
        fps={fps}
        totalFrames={Math.max(1, totalFrames)}
      />)}
    </div>
  );
}
