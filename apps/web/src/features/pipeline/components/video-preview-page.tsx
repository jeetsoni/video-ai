"use client";

import { AlertTriangle, RefreshCw, LifeBuoy } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { StageProgressHeader } from "./stage-progress-header";
import { VideoPreviewSection } from "./video-preview-section";
import { StageTimeline } from "./stage-timeline";
import { VideoMetadata } from "./video-metadata";

interface VideoPreviewPageProps {
  job: PipelineJobDto;
  onRetry: () => void;
  pollingError?: Error | null;
  onRefresh?: () => void;
}

export function VideoPreviewPage({
  job,
  onRetry,
  pollingError,
  onRefresh,
}: VideoPreviewPageProps) {
  const isCompletedWithoutVideo =
    job.status === "completed" && !job.videoUrl;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      {/* Polling error banner (Req 8.1) */}
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
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div className="space-y-6">
          {/* Video preview area */}
          <VideoPreviewSection
            status={job.status}
            videoUrl={job.videoUrl}
            format={job.format}
            errorMessage={job.errorMessage}
            onRetry={onRetry}
          />

          {/* Contact Support fallback (Req 7.3, 7.4) */}
          {isCompletedWithoutVideo && (
            <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
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

          {/* Video metadata */}
          <VideoMetadata
            topic={job.topic}
            format={job.format}
            themeId={job.themeId}
            createdAt={job.createdAt}
            videoUrl={job.videoUrl}
          />
        </div>

        {/* Sidebar: stage timeline */}
        <aside>
          <StageTimeline stage={job.stage} status={job.status} />
        </aside>
      </div>

      {/* Manual refresh button (Req 8.3) */}
      {onRefresh && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-on-surface-variant"
            onClick={onRefresh}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}

export type { VideoPreviewPageProps };
