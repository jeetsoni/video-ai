"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { PlayerRef } from "@remotion/player";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  LifeBuoy,
  RefreshCw,
  Wand2,
  MessageSquare,
  Film,
  Monitor,
} from "lucide-react";
import {
  type PipelineJobDto,
  type PipelineStage,
  type SceneProgressInfo,
  type SceneBoundary,
} from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { usePreviewData } from "../hooks/use-preview-data";
import { getStageDisplayInfo } from "../utils/stage-display-map";
import { VideoPreviewSection } from "./video-preview-section";
import { RemotionPreviewPlayer, OverlayControls } from "./remotion-preview-player";
import { ProgressiveScenePreview } from "./progressive-scene-preview";
import { ChatPanel } from "./chat-panel";
import { SmartDownloadButton } from "./smart-download-button";
import { SceneTimeline } from "./scene-timeline";

type MobileTab = "preview" | "chat" | "timeline";

interface VideoPreviewPageProps {
  job: PipelineJobDto;
  onRetry: () => void;
  onRetryJob?: () => void;
  onBack?: () => void;
  pollingError?: Error | null;
  onRefresh?: () => void;
  onExport?: () => void;
  repository: PipelineRepository;
  sceneProgress?: Map<number, SceneProgressInfo>;
  completedSceneCodes?: Map<number, string>;
}

const PREVIEW_STAGES: ReadonlySet<PipelineStage> = new Set([
  "preview",
  "rendering",
  "done",
]);

const ASPECT_CLASSES: Record<string, string> = {
  reel: "aspect-[9/16]",
  short: "aspect-[9/16]",
  longform: "aspect-[16/9]",
};

function PreviewSkeleton({ format }: { format: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-white/4 animate-pulse",
        ASPECT_CLASSES[format] ?? "aspect-video",
      )}
      role="status"
      aria-label="Loading preview"
    />
  );
}

function PreviewError({
  error,
  onRetry,
  onAutofix,
  isAutofixing,
  autofixExplanation,
}: {
  error: string;
  onRetry: () => void;
  onAutofix?: () => void;
  isAutofixing?: boolean;
  autofixExplanation?: string | null;
}) {
  const isRuntimeError =
    error.includes("is not defined") ||
    error.includes("ReferenceError") ||
    error.includes("TypeError") ||
    error.includes("Cannot read");

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl bg-destructive/10 p-6 sm:p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10">
        <AlertTriangle className="size-6 text-stage-failed" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stage-failed">
          Preview Failed
        </p>
        <p className="text-sm text-white/50 max-w-md">{error}</p>
        {autofixExplanation && (
          <p className="text-xs text-emerald-400 mt-2">
            ✓ {autofixExplanation}
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {isRuntimeError && onAutofix && (
          <Button
            variant="default"
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={onAutofix}
            disabled={isAutofixing}
          >
            {isAutofixing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {isAutofixing ? "Fixing..." : "Autofix"}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" />
          {isRuntimeError ? "Regenerate" : "Retry"}
        </Button>
      </div>
    </div>
  );
}

function RenderingProgress() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/4 px-4 py-3">
      <Loader2 className="size-4 animate-spin text-stage-active" />
      <p className="text-sm text-white/50">
        Rendering your video… This may take a few minutes.
      </p>
    </div>
  );
}

export function VideoPreviewPage({
  job,
  onRetry,
  onRetryJob,
  onBack,
  pollingError,
  onRefresh,
  onExport,
  repository,
  sceneProgress,
  completedSceneCodes,
}: VideoPreviewPageProps) {
  const isPreviewEligible = PREVIEW_STAGES.has(job.stage);

  const {
    previewData,
    evaluatedComponent,
    isLoading: previewLoading,
    error: previewError,
    refetch,
    audioLoadError,
    refreshAudioUrl,
  } = usePreviewData({
    repository,
    jobId: job.id,
    stage: job.stage,
  });

  const isCompletedWithoutVideo =
    job.stage === "done" && job.status === "completed" && !job.videoUrl;

  const stageInfo = getStageDisplayInfo(job.stage);
  const StageIcon = stageInfo.icon;

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isAutofixing, setIsAutofixing] = useState(false);
  const [autofixExplanation, setAutofixExplanation] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");

  // Track whether the smart download button initiated a render so we can auto-download on completion
  const pendingDownloadRef = useRef<boolean>(false);

  // Refs for ChatPanel integration — player ref for frame/time, container ref for screenshots
  const playerRefObj = useRef<PlayerRef | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const handlePlayerRef = useCallback((ref: PlayerRef | null) => {
    playerRefObj.current = ref;
  }, []);

  // Wrap onExport to set the pending download flag before triggering the render
  const handleSmartExport = useCallback(() => {
    pendingDownloadRef.current = true;
    onExport?.();
  }, [onExport]);

  // Auto-download when a render completes that was initiated by the smart download button
  useEffect(() => {
    if (job.stage === "done" && job.videoUrl && pendingDownloadRef.current) {
      pendingDownloadRef.current = false;
      (async () => {
        try {
          const res = await fetch(job.videoUrl!);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${job.topic || "video"}.mp4`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch {
          window.open(job.videoUrl!, "_blank");
        }
      })();
    }

    if (job.status === "failed") {
      pendingDownloadRef.current = false;
    }
  }, [job.stage, job.videoUrl, job.topic]);

  const handleRegenerateCode = useCallback(async () => {
    setIsRegenerating(true);
    setAutofixExplanation(null);
    try {
      await repository.regenerateCode(job.id);
      onRefresh?.();
    } catch {
      // Polling will pick up the state change
    } finally {
      setIsRegenerating(false);
    }
  }, [job.id, repository, onRefresh]);

  const handleAutofixCode = useCallback(async () => {
    if (!previewError) return;

    setIsAutofixing(true);
    setAutofixExplanation(null);

    let errorType = "Runtime Error";
    if (previewError.includes("ReferenceError") || previewError.includes("is not defined")) {
      errorType = "ReferenceError";
    } else if (previewError.includes("TypeError")) {
      errorType = "TypeError";
    } else if (previewError.includes("SyntaxError")) {
      errorType = "SyntaxError";
    }

    try {
      const result = await repository.autofixCode({
        jobId: job.id,
        errorMessage: previewError,
        errorType,
      });
      setAutofixExplanation(result.explanation);
      await refetch();
    } catch (err) {
      console.error("Autofix failed:", err);
    } finally {
      setIsAutofixing(false);
    }
  }, [job.id, previewError, repository, refetch]);

  const handleAutofixForPlayer = useCallback(
    async (errorMessage: string, errorType: string) => {
      setIsAutofixing(true);
      setAutofixExplanation(null);
      try {
        const result = await repository.autofixCode({
          jobId: job.id,
          errorMessage,
          errorType,
        });
        setAutofixExplanation(result.explanation);
        await refetch();
      } catch (err) {
        console.error("Autofix failed:", err);
      } finally {
        setIsAutofixing(false);
      }
    },
    [job.id, repository, refetch],
  );

  // Determine what to render in the preview area
  function renderPreviewArea() {
    if (job.stage === "code_generation" && sceneProgress && sceneProgress.size > 0) {
      const sceneBoundaries: SceneBoundary[] =
        job.scenePlan && job.scenePlan.length > 0
          ? job.scenePlan
          : Array.from(sceneProgress.values()).map((sp, index) => ({
              id: sp.sceneId,
              name: sp.sceneName,
              type: "Bridge" as const,
              startTime: index * 5,
              endTime: (index + 1) * 5,
              text: "",
            }));

      return (
        <ProgressiveScenePreview
          sceneBoundaries={sceneBoundaries}
          completedSceneCodes={completedSceneCodes ?? new Map()}
          sceneProgress={sceneProgress}
          format={job.format}
        />
      );
    }

    if (job.stage === "direction_generation" && job.scenePlan && job.scenePlan.length > 0) {
      return (
        <ProgressiveScenePreview
          sceneBoundaries={job.scenePlan}
          completedSceneCodes={completedSceneCodes ?? new Map()}
          sceneProgress={sceneProgress ?? new Map()}
          format={job.format}
        />
      );
    }

    if (job.stage === "direction_generation" || job.stage === "code_generation") {
      return (
        <div className="w-full h-full min-h-[300px] rounded-2xl bg-white/4 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center p-8">
            <Loader2 className="size-6 animate-spin text-stage-active" />
            <p className="text-sm text-white/50">Generating scene animations…</p>
            <p className="text-xs text-white/30">Preview will appear as each scene completes</p>
          </div>
        </div>
      );
    }

    if (!isPreviewEligible) {
      if (job.status === "failed") {
        return (
          <VideoPreviewSection
            status={job.status}
            videoUrl={job.videoUrl}
            format={job.format}
            errorMessage={job.errorMessage}
            onRetry={onRetryJob ?? onRetry}
          />
        );
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 bg-white/4 rounded-2xl">
          <div className={cn("flex size-12 items-center justify-center rounded-xl", "bg-stage-active/20")}>
            <StageIcon className="size-6 text-stage-active" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white">{stageInfo.label}</p>
            <p className="text-xs text-white/50">{stageInfo.description}</p>
          </div>
          <div className="w-full max-w-[200px]">
            <div
              className="h-1.5 rounded-full bg-white/6"
              role="progressbar"
              aria-valuenow={job.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full gradient-primary transition-all"
                style={{ width: `${job.progressPercent}%` }}
              />
            </div>
            <p className="text-[10px] tabular-nums text-white/40 text-center mt-1">
              {job.progressPercent}%
            </p>
          </div>
        </div>
      );
    }

    if (previewLoading) {
      return <PreviewSkeleton format={job.format} />;
    }

    if (previewError) {
      const isSyntaxOrEvalError =
        previewError.startsWith("SyntaxError") || previewError.includes("does not define a Main");
      const isRuntimeError =
        previewError.includes("is not defined") ||
        previewError.includes("ReferenceError") ||
        previewError.includes("TypeError");
      return (
        <PreviewError
          error={previewError}
          onRetry={isSyntaxOrEvalError || isRuntimeError ? handleRegenerateCode : refetch}
          onAutofix={isRuntimeError ? handleAutofixCode : undefined}
          isAutofixing={isAutofixing}
          autofixExplanation={autofixExplanation}
        />
      );
    }

    if (evaluatedComponent && previewData) {
      return (
        <RemotionPreviewPlayer
          component={evaluatedComponent}
          scenePlan={previewData.scenePlan}
          audioUrl={previewData.audioUrl}
          fps={previewData.fps}
          totalFrames={previewData.totalFrames}
          compositionWidth={previewData.compositionWidth}
          compositionHeight={previewData.compositionHeight}
          onAudioError={refreshAudioUrl}
          onAutofix={handleAutofixForPlayer}
          onRegenerate={handleRegenerateCode}
          isAutofixing={isAutofixing}
          onPlayerRef={handlePlayerRef}
          containerRef={playerContainerRef}
          hideControls
        />
      );
    }

    return <PreviewSkeleton format={job.format} />;
  }

  const scenes = job.scenePlan ?? job.approvedScenes ?? [];
  const totalDuration = previewData ? previewData.totalFrames / previewData.fps : 0;
  const isVerticalFormat = job.format === "reel" || job.format === "short";

  // Shared panel content
  const chatPanelContent = isPreviewEligible && evaluatedComponent && previewData ? (
    <ChatPanel
      job={job}
      repository={repository}
      playerRef={playerRefObj}
      playerContainerRef={playerContainerRef}
      fps={previewData.fps}
      onCodeUpdated={async () => { await refetch(); onRefresh?.(); }}
    />
  ) : (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="space-y-2">
        <StageIcon className={cn("size-8 mx-auto", job.status === "failed" ? "text-stage-failed" : "text-white/20")} />
        <p className="text-sm text-white/50">
          {job.status === "failed" ? "Processing failed" : "Chat available once preview is ready"}
        </p>
      </div>
    </div>
  );

  const timelinePanelContent = (
    <SceneTimeline
      scenes={scenes}
      format={job.format}
      themeId={job.themeId}
      voiceId={job.voiceId}
      voiceSettings={job.voiceSettings}
      createdAt={job.createdAt}
      totalDuration={totalDuration}
    />
  );

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col px-3 sm:px-4 lg:px-6 py-3">
      {/* Polling error banner */}
      {pollingError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-stage-failed/30 bg-stage-failed/10 px-4 py-3 mb-3 shrink-0">
          <AlertTriangle className="size-4 shrink-0 text-stage-failed" />
          <p className="flex-1 text-sm text-stage-failed">Unable to fetch latest status. Retrying automatically…</p>
          {onRefresh && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-stage-failed" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />Refresh
            </Button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 sm:gap-3 mb-3 shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-white/50 hover:text-white transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="size-5 sm:size-6" />
          </button>
        )}
        <h1 className="flex-1 text-base sm:text-lg lg:text-xl font-light text-white truncate min-w-0">
          {job.topic}
        </h1>
        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          {(job.stage === "preview" || job.stage === "rendering" || job.stage === "done") && onExport && (
            <SmartDownloadButton job={job} onExport={handleSmartExport} />
          )}
          {(job.stage === "preview" || job.stage === "done") && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs px-2 sm:px-3"
              onClick={handleRegenerateCode}
              disabled={isRegenerating}
            >
              {isRegenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              <span className="hidden sm:inline">Regenerate</span>
            </Button>
          )}
          {!isPreviewEligible && (job.status === "failed" || job.status === "processing") && onRetryJob && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs px-2 sm:px-3"
              onClick={() => onRetryJob()}
            >
              <RefreshCw className="size-3" />Retry
            </Button>
          )}
        </div>
      </div>

      {/* Mobile tab bar — visible below lg */}
      <div className="flex lg:hidden shrink-0 mb-3 rounded-xl bg-white/5 p-1 gap-1">
        {(
          [
            { id: "chat" as MobileTab, label: "Chat", icon: MessageSquare },
            { id: "preview" as MobileTab, label: "Preview", icon: Monitor },
            { id: "timeline" as MobileTab, label: "Timeline", icon: Film },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mobileTab === id
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 flex gap-3 lg:gap-4 overflow-hidden">

        {/* ── Chat panel ── */}
        {/* Desktop: always visible as left column */}
        <div className="hidden lg:flex w-[28%] xl:w-1/3 shrink-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-white/3 backdrop-blur-xl">
          {chatPanelContent}
        </div>
        {/* Mobile: shown when chat tab is active */}
        <div className={cn("lg:hidden flex-1 flex flex-col overflow-hidden rounded-xl border border-white/8 bg-white/3 backdrop-blur-xl", mobileTab !== "chat" && "hidden")}>
          {chatPanelContent}
        </div>

        {/* ── Center preview ── */}
        <div className={cn(
          "flex-1 flex flex-col items-center justify-start sm:justify-center gap-2 min-h-0 overflow-y-auto",
          // On mobile, hide when another tab is active
          "lg:flex",
          mobileTab !== "preview" && "hidden lg:flex",
        )}>
          {/* Preview container — phone frame for vertical, widescreen for horizontal */}
          <div
            className={cn(
              "relative overflow-hidden shrink-0",
              isVerticalFormat
                ? "rounded-4xl sm:rounded-[2.8rem] border-[5px] sm:border-[7px] border-white/18 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_32px_80px_rgba(0,0,0,0.8)] bg-black"
                : "rounded-2xl border border-white/8 shadow-[0_8px_48px_rgba(0,0,0,0.5)] w-full",
            )}
            style={
              isVerticalFormat
                ? {
                    // Fill available height, constrain width by aspect ratio
                    // Use dvh so it works on mobile browsers with dynamic toolbars
                    height: "min(calc(100dvh - 14rem), 680px)",
                    width: "calc(min(calc(100dvh - 14rem), 680px) * 9 / 16)",
                    maxWidth: "min(calc(100vw - 2rem), 360px)",
                    maxHeight: "calc((min(calc(100vw - 2rem), 360px)) * 16 / 9)",
                  }
                : { maxWidth: "min(100%, 560px)", aspectRatio: "16/9" }
            }
          >
            {isVerticalFormat && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-20 sm:w-24 h-5 sm:h-6 bg-black rounded-b-2xl" />
            )}
            {renderPreviewArea()}
          </div>

          {/* External player controls */}
          {isPreviewEligible && evaluatedComponent && previewData && (
            <div
              className="w-full shrink-0"
              style={{
                maxWidth: isVerticalFormat
                  ? "min(calc(min(calc(100dvh - 14rem), 680px) * 9 / 16), min(calc(100vw - 2rem), 360px))"
                  : "min(100%, 560px)",
              }}
            >
              <OverlayControls
                external
                playerRef={playerRefObj}
                fps={previewData.fps}
                totalFrames={previewData.totalFrames}
              />
            </div>
          )}

          {/* Status messages */}
          {isPreviewEligible && audioLoadError && (
            <div className="flex items-center gap-2 rounded-lg bg-stage-failed/10 border border-stage-failed/30 px-3 py-2 text-xs text-stage-failed shrink-0">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Audio failed to load</span>
              <Button variant="ghost" size="sm" className="gap-1 text-stage-failed h-6 px-2 text-xs" onClick={refreshAudioUrl}>
                <RefreshCw className="size-3" />Retry
              </Button>
            </div>
          )}
          {job.stage === "rendering" && <RenderingProgress />}
          {isCompletedWithoutVideo && (
            <div className="flex items-center gap-2 text-xs text-white/40 shrink-0">
              <LifeBuoy className="size-3.5" />
              <span>Video file not available.</span>
            </div>
          )}
        </div>

        {/* ── Scene Timeline ── */}
        {/* Desktop: always visible as right column */}
        <div className="hidden lg:flex w-[28%] xl:w-1/3 shrink-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-white/3 backdrop-blur-xl">
          {timelinePanelContent}
        </div>
        {/* Mobile: shown when timeline tab is active */}
        <div className={cn("lg:hidden flex-1 flex flex-col overflow-hidden rounded-xl border border-white/8 bg-white/3 backdrop-blur-xl", mobileTab !== "timeline" && "hidden")}>
          {timelinePanelContent}
        </div>

      </div>
    </main>
  );
}

export type { VideoPreviewPageProps };
