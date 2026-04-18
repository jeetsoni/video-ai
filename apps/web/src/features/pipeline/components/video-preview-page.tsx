"use client";

import {
  AlertTriangle,
  Download,
  Loader2,
  LifeBuoy,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type { PipelineJobDto, PipelineStage } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { usePreviewData } from "../hooks/use-preview-data";
import { StageProgressHeader } from "./stage-progress-header";
import { VideoPreviewSection } from "./video-preview-section";
import { StageTimeline } from "./stage-timeline";
import { RemotionPreviewPlayer } from "./remotion-preview-player";

interface VideoPreviewPageProps {
  job: PipelineJobDto;
  onRetry: () => void;
  pollingError?: Error | null;
  onRefresh?: () => void;
  onExport?: () => void;
  repository: PipelineRepository;
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
        "w-full rounded-xl bg-surface-container-high animate-pulse",
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
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl bg-stage-failed/20 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-stage-failed/20">
        <AlertTriangle className="size-6 text-stage-failed" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stage-failed">
          Preview Failed
        </p>
        <p className="text-sm text-on-surface-variant">{error}</p>
      </div>
      <Button variant="secondary" size="sm" className="gap-2" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
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
  pollingError,
  onRefresh,
  onExport,
  repository,
}: VideoPreviewPageProps) {
  const isPreviewEligible = PREVIEW_STAGES.has(job.stage);

  const {
    previewData,
    evaluatedComponent,
    isLoading: previewLoading,
    error: previewError,
    refetch,
  } = usePreviewData({
    repository,
    jobId: job.id,
    stage: job.stage,
  });

  const isCompletedWithoutVideo =
    job.stage === "done" && job.status === "completed" && !job.videoUrl;

  // Determine what to render in the preview area
  function renderPreviewArea() {
    // For stages before preview, use the existing VideoPreviewSection
    if (!isPreviewEligible) {
      return (
        <VideoPreviewSection
          status={job.status}
          videoUrl={job.videoUrl}
          format={job.format}
          errorMessage={job.errorMessage}
          onRetry={onRetry}
        />
      );
    }

    // Loading state while fetching preview data
    if (previewLoading) {
      return <PreviewSkeleton format={job.format} />;
    }

    // Error state from fetch or code evaluation
    if (previewError) {
      return <PreviewError error={previewError} onRetry={refetch} />;
    }

    // Always show Remotion live preview from code for preview-eligible stages
    if (evaluatedComponent && previewData) {
      return (
        <div className="relative">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 backdrop-blur-sm">
            <Play className="size-3 text-amber-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              Live Preview
            </span>
          </div>
          <RemotionPreviewPlayer
            component={evaluatedComponent}
            scenePlan={previewData.scenePlan}
            audioUrl={previewData.audioUrl}
            fps={previewData.fps}
            totalFrames={previewData.totalFrames}
            compositionWidth={previewData.compositionWidth}
            compositionHeight={previewData.compositionHeight}
          />
        </div>
      );
    }

    // Fallback skeleton if preview data hasn't arrived yet
    return <PreviewSkeleton format={job.format} />;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col gap-4 overflow-hidden px-6 py-4">
      {/* Polling error banner */}
      {pollingError && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-3 rounded-xl border border-stage-failed/30 bg-stage-failed/10 px-4 py-3",
          )}
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

      {/* Stage progress header */}
      <StageProgressHeader
        stage={job.stage}
        status={job.status}
        progressPercent={job.progressPercent}
      />

      {/* Main content: two-column on lg, stacked on mobile */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_220px]">
        <div className="flex min-h-0 flex-col">
          {/* Preview / video area — takes available space */}
          <div className="min-h-0 flex-1">
            {renderPreviewArea()}
          </div>

          {/* Action bar — pinned below the player, never overlaps */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 pt-3">
            {/* Audio unavailable warning */}
            {isPreviewEligible && previewData?.audioError && (
              <div className="flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant">
                <Volume2 className="size-4 shrink-0" />
                <span>Audio unavailable.</span>
              </div>
            )}

            {/* Rendering progress indicator */}
            {job.stage === "rendering" && <RenderingProgress />}

            {/* Download MP4 — triggers export when in preview, shows download when done */}
            {isPreviewEligible && evaluatedComponent && (
              <>
                {job.stage === "preview" && onExport && (
                  <Button className="gap-2" onClick={onExport}>
                    <Download className="size-4" />
                    Download MP4
                  </Button>
                )}
                {job.stage === "rendering" && (
                  <Button className="gap-2" disabled>
                    <Loader2 className="size-4 animate-spin" />
                    Rendering…
                  </Button>
                )}
                {job.stage === "done" && job.videoUrl && (
                  <Button
                    className="gap-2"
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
                    <Download className="size-4" />
                    Download MP4
                  </Button>
                )}
              </>
            )}

            {/* Contact Support fallback */}
            {isCompletedWithoutVideo && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <LifeBuoy className="size-4" />
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

            {/* Inline metadata */}
            <div className="ml-auto flex items-center gap-3 text-xs text-on-surface-variant">
              <span className="rounded bg-secondary/20 px-2 py-0.5 font-bold uppercase tracking-widest text-secondary">
                {job.format}
              </span>
              {job.themeId && <span>{job.themeId}</span>}
              <span>{new Date(job.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Sidebar: stage timeline */}
        <aside className="overflow-y-auto">
          <StageTimeline stage={job.stage} status={job.status} />
        </aside>
      </div>
    </div>
  );
}

export type { VideoPreviewPageProps };
