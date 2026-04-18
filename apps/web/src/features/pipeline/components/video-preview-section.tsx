"use client";

import { AlertTriangle, RefreshCw, VideoOff } from "lucide-react";
import type { PipelineStatus, VideoFormat } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

interface VideoPreviewSectionProps {
  status: PipelineStatus;
  videoUrl?: string;
  format: VideoFormat;
  errorMessage?: string;
  onRetry: () => void;
}

const ASPECT_CLASSES: Record<VideoFormat, string> = {
  reel: "aspect-[9/16]",
  short: "aspect-[9/16]",
  longform: "aspect-[16/9]",
};

function SkeletonPlaceholder({ format }: { format: VideoFormat }) {
  return (
    <div
      className={cn(
        "w-full rounded-xl bg-surface-container-high animate-pulse",
        ASPECT_CLASSES[format],
      )}
      role="status"
      aria-label="Video loading"
    />
  );
}

function VideoPlayer({ videoUrl, format }: { videoUrl: string; format: VideoFormat }) {
  return (
    <video
      src={videoUrl}
      controls
      className={cn("w-full rounded-xl bg-black", ASPECT_CLASSES[format])}
      aria-label="Video preview"
    />
  );
}

function ErrorCard({ errorMessage, onRetry }: { errorMessage?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl bg-stage-failed/20 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-stage-failed/20">
        <AlertTriangle className="size-6 text-stage-failed" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stage-failed">Generation Failed</p>
        {errorMessage && (
          <p className="text-sm text-on-surface-variant">{errorMessage}</p>
        )}
      </div>
      <Button variant="secondary" size="sm" className="gap-2" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

function FallbackMessage() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-container-high p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-surface-container-high">
        <VideoOff className="size-6 text-on-surface-variant" />
      </div>
      <p className="text-sm text-on-surface-variant">
        Video processing complete but the file is not yet available.
      </p>
    </div>
  );
}

export function VideoPreviewSection({
  status,
  videoUrl,
  format,
  errorMessage,
  onRetry,
}: VideoPreviewSectionProps) {
  if (status === "failed") {
    return <ErrorCard errorMessage={errorMessage} onRetry={onRetry} />;
  }

  if (status === "completed") {
    if (videoUrl) {
      return <VideoPlayer videoUrl={videoUrl} format={format} />;
    }
    return <FallbackMessage />;
  }

  return <SkeletonPlaceholder format={format} />;
}

export type { VideoPreviewSectionProps };
