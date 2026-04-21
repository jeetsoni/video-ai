"use client";

import { useState, useCallback, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import {
  AlertTriangle,
  Download,
  Loader2,
  LifeBuoy,
  Play,
  RefreshCw,
  Volume2,
  Wand2,
} from "lucide-react";
import {
  FORMAT_RESOLUTIONS,
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
import { RemotionPreviewPlayer } from "./remotion-preview-player";
import { ProgressiveScenePreview } from "./progressive-scene-preview";
import { ChatPanel } from "./chat-panel";

interface VideoPreviewPageProps {
  job: PipelineJobDto;
  onRetry: () => void;
  onRetryJob?: () => void;
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

const FORMAT_LABELS: Record<string, string> = {
  reel: "Reel",
  short: "Short",
  longform: "Longform",
};

function PreviewSkeleton({ format }: { format: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-surface-container-high animate-pulse",
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
    <div className="flex flex-col items-center gap-4 rounded-xl bg-stage-failed/20 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-stage-failed/20">
        <AlertTriangle className="size-6 text-stage-failed" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stage-failed">
          Preview Failed
        </p>
        <p className="text-sm text-on-surface-variant max-w-md">{error}</p>
        {autofixExplanation && (
          <p className="text-xs text-emerald-400 mt-2">
            ✓ {autofixExplanation}
          </p>
        )}
      </div>
      <div className="flex gap-2">
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
    <div className="flex items-center gap-3 rounded-xl bg-surface-container-high px-4 py-3">
      <Loader2 className="size-4 animate-spin text-stage-active" />
      <p className="text-sm text-on-surface-variant">
        Rendering your video… This may take a few minutes.
      </p>
    </div>
  );
}

export function VideoPreviewPage({
  job,
  onRetry,
  onRetryJob,
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
  const resolution =
    FORMAT_RESOLUTIONS[job.format as keyof typeof FORMAT_RESOLUTIONS];

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isAutofixing, setIsAutofixing] = useState(false);
  const [autofixExplanation, setAutofixExplanation] = useState<string | null>(
    null,
  );

  // Refs for ChatPanel integration — player ref for frame/time, container ref for screenshots
  const playerRefObj = useRef<PlayerRef | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const handlePlayerRef = useCallback((ref: PlayerRef | null) => {
    playerRefObj.current = ref;
  }, []);

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

    // Parse error type from the error message
    let errorType = "Runtime Error";
    if (
      previewError.includes("ReferenceError") ||
      previewError.includes("is not defined")
    ) {
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
      // Refetch to get the updated code
      await refetch();
    } catch (err) {
      console.error("Autofix failed:", err);
      // If autofix fails, user can still use regenerate
    } finally {
      setIsAutofixing(false);
    }
  }, [job.id, previewError, repository, refetch]);

  // Handler for autofix from the player (receives error details directly)
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
        // Refetch to get the updated code
        await refetch();
      } catch (err) {
        console.error("Autofix failed:", err);
        // If autofix fails, user can still use regenerate
      } finally {
        setIsAutofixing(false);
      }
    },
    [job.id, repository, refetch],
  );

  // Determine what to render in the preview area
  function renderPreviewArea() {
    // During code_generation, show progressive preview if we have scene progress data
    // We can derive scene boundaries from sceneProgress even if job.scenePlan isn't loaded yet
    if (
      job.stage === "code_generation" &&
      sceneProgress &&
      sceneProgress.size > 0
    ) {
      // Build scene boundaries from sceneProgress if job.scenePlan is not available
      const sceneBoundaries: SceneBoundary[] =
        job.scenePlan && job.scenePlan.length > 0
          ? job.scenePlan
          : Array.from(sceneProgress.values()).map((sp, index) => ({
              id: sp.sceneId,
              name: sp.sceneName,
              type: "Bridge" as const,
              startTime: index * 5, // Placeholder timing
              endTime: (index + 1) * 5,
              text: "",
            }));

      console.log(
        "[NEW CODE] Rendering ProgressiveScenePreview with",
        sceneBoundaries.length,
        "scenes",
      );
      return (
        <ProgressiveScenePreview
          sceneBoundaries={sceneBoundaries}
          completedSceneCodes={completedSceneCodes ?? new Map()}
          sceneProgress={sceneProgress}
          format={job.format}
        />
      );
    }

    // For direction_generation with scenePlan, also show progressive preview
    if (
      job.stage === "direction_generation" &&
      job.scenePlan &&
      job.scenePlan.length > 0
    ) {
      return (
        <ProgressiveScenePreview
          sceneBoundaries={job.scenePlan}
          completedSceneCodes={completedSceneCodes ?? new Map()}
          sceneProgress={sceneProgress ?? new Map()}
          format={job.format}
        />
      );
    }

    // During direction_generation or code_generation but before scene data arrives,
    // show the generating loader so users always see feedback.
    // Use h-full instead of aspect ratio so the loader fills the flex container
    // and stays visible on desktop where the parent has overflow-hidden.
    if (
      job.stage === "direction_generation" ||
      job.stage === "code_generation"
    ) {
      return (
        <div className="w-full h-full min-h-[300px] rounded-2xl bg-surface-container-high flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center p-8">
            <Loader2 className="size-6 animate-spin text-stage-active" />
            <p className="text-sm text-on-surface-variant">
              Generating scene animations…
            </p>
            <p className="text-xs text-on-surface-variant/60">
              Preview will appear as each scene completes
            </p>
          </div>
        </div>
      );
    }

    // For stages before preview (but not code_generation/direction_generation), use the existing VideoPreviewSection
    if (!isPreviewEligible) {
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

    // Loading state while fetching preview data
    if (previewLoading) {
      return <PreviewSkeleton format={job.format} />;
    }

    // Error state from fetch or code evaluation
    if (previewError) {
      const isSyntaxOrEvalError =
        previewError.startsWith("SyntaxError") ||
        previewError.includes("does not define a Main");
      const isRuntimeError =
        previewError.includes("is not defined") ||
        previewError.includes("ReferenceError") ||
        previewError.includes("TypeError");
      return (
        <PreviewError
          error={previewError}
          onRetry={
            isSyntaxOrEvalError || isRuntimeError
              ? handleRegenerateCode
              : refetch
          }
          onAutofix={isRuntimeError ? handleAutofixCode : undefined}
          isAutofixing={isAutofixing}
          autofixExplanation={autofixExplanation}
        />
      );
    }

    // Always show Remotion live preview from code for preview-eligible stages
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
        />
      );
    }

    // Fallback skeleton if preview data hasn't arrived yet
    return <PreviewSkeleton format={job.format} />;
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col px-6 py-4">
      {/* Polling error banner */}
      {pollingError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-stage-failed/30 bg-stage-failed/10 px-4 py-3 mb-4"
        >
          <AlertTriangle className="size-4 shrink-0 text-stage-failed" />
          <p className="flex-1 text-sm text-stage-failed">
            Unable to fetch latest status. Retrying automatically…
          </p>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-stage-failed"
              onClick={onRefresh}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          )}
        </div>
      )}

      {/* Main content: 9:16 optimized — narrow player left, wide panel right */}
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(280px,1fr)_minmax(400px,1.5fr)] gap-6">
        {/* ── Left Column: Player + Actions ── */}
        <section className="flex min-h-0 flex-col items-center gap-3">
          {/* Preview / video area — phone-frame style for 9:16 */}
          <div className="min-h-0 flex-1 w-full flex justify-center">
            <div
              className={cn(
                "relative rounded-2xl overflow-hidden shadow-ambient-lg border border-white/6",
                ASPECT_CLASSES[job.format] ?? "aspect-video",
              )}
              style={{
                height: "100%",
                maxWidth: "min(100%, 420px)",
              }}
            >
              {/* Live Preview badge */}
              {isPreviewEligible && evaluatedComponent && previewData && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 glass rounded-lg px-2.5 py-1">
                  <Play className="size-3 text-amber-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                    Live Preview
                  </span>
                </div>
              )}
              {renderPreviewArea()}
            </div>
          </div>

          {/* Action buttons below player */}
          {isPreviewEligible && evaluatedComponent && (
            <div className="flex gap-2 shrink-0">
              {job.stage === "preview" && onExport && (
                <Button
                  size="sm"
                  className="gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
                  onClick={onExport}
                >
                  <Download className="size-3.5" />
                  Export MP4
                </Button>
              )}
              {job.stage === "rendering" && (
                <Button
                  size="sm"
                  className="gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
                  disabled
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  Rendering…
                </Button>
              )}
              {job.stage === "done" && job.videoUrl && (
                <Button
                  size="sm"
                  className="gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
                  onClick={async () => {
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
                  }}
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
              )}
              {job.stage === "done" && onExport && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={onExport}
                >
                  <RefreshCw className="size-3.5" />
                  Re-render
                </Button>
              )}
              {(job.stage === "preview" || job.stage === "done") && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={handleRegenerateCode}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Regenerate
                </Button>
              )}
            </div>
          )}

          {/* Retry for non-preview failed jobs */}
          {!isPreviewEligible &&
            (job.status === "failed" || job.status === "processing") &&
            onRetryJob && (
              <Button
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={() => {
                  onRetryJob();
                }}
              >
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            )}

          {/* Status messages */}
          {isPreviewEligible && audioLoadError && (
            <div className="flex items-center gap-2 rounded-lg bg-stage-failed/10 border border-stage-failed/30 px-3 py-2 text-xs text-stage-failed">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Audio failed to load</span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-stage-failed h-6 px-2 text-xs"
                onClick={refreshAudioUrl}
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            </div>
          )}

          {job.stage === "rendering" && <RenderingProgress />}

          {isCompletedWithoutVideo && (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <LifeBuoy className="size-3.5" />
              <span>
                Video file not available.{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
                >
                  Contact Support
                </button>
              </span>
            </div>
          )}
        </section>

        {/* ── Right Column: Chat-first panel ── */}
        <section className="flex flex-col min-h-0 rounded-2xl bg-surface-container-high/30 overflow-hidden">
          {isPreviewEligible && evaluatedComponent && previewData ? (
            <ChatPanel
              job={job}
              repository={repository}
              playerRef={playerRefObj}
              playerContainerRef={playerContainerRef}
              fps={previewData.fps}
              onCodeUpdated={refetch}
              onExport={onExport}
              onRegenerate={handleRegenerateCode}
              isRegenerating={isRegenerating}
            />
          ) : (
            <div className="flex flex-col gap-4 p-4">
              {/* Compact Stage Indicator */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg",
                    job.status === "failed"
                      ? "bg-stage-failed/20"
                      : job.stage === "done"
                        ? "bg-stage-complete/20"
                        : "bg-stage-active/20",
                  )}
                >
                  <StageIcon
                    className={cn(
                      "size-4",
                      job.status === "failed"
                        ? "text-stage-failed"
                        : job.stage === "done"
                          ? "text-stage-complete"
                          : "text-stage-active",
                    )}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {job.status === "failed"
                      ? `${stageInfo.label} — Failed`
                      : stageInfo.label}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {job.status === "failed"
                      ? (job.errorMessage ??
                          "An error occurred during processing")
                      : stageInfo.description}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div
                className="h-1.5 rounded-full bg-surface-container-high"
                role="progressbar"
                aria-valuenow={job.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    job.status === "failed"
                      ? "bg-stage-failed"
                      : job.stage === "done"
                        ? "bg-stage-complete"
                        : "gradient-primary",
                  )}
                  style={{ width: `${job.progressPercent}%` }}
                />
              </div>

              {/* Summary Card */}
              <div className="glass rounded-xl shadow-ambient p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="label-caps">Format</p>
                    <p className="text-sm text-on-surface">
                      {FORMAT_LABELS[job.format] ?? job.format}
                    </p>
                  </div>
                  <div>
                    <p className="label-caps">Resolution</p>
                    <p className="text-sm text-on-surface">
                      {resolution.width} × {resolution.height}
                    </p>
                  </div>
                  {job.themeId && (
                    <div>
                      <p className="label-caps">Theme</p>
                      <p className="text-sm text-on-surface">{job.themeId}</p>
                    </div>
                  )}
                  <div>
                    <p className="label-caps">Created</p>
                    <p className="text-sm text-on-surface">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {isPreviewEligible && previewData?.audioError && (
                <div className="flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant">
                  <Volume2 className="size-4 shrink-0" />
                  <span>Audio unavailable.</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export type { VideoPreviewPageProps };
