"use client";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";

interface SmartDownloadButtonProps {
  job: PipelineJobDto;
  onExport: () => void;
}

function SmartDownloadButton({ job, onExport }: SmartDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDirectDownload = useCallback(async () => {
    if (!job.videoUrl) return;

    // flushSync ensures the loading state renders before the fetch starts,
    // so the user sees feedback immediately on click.
    flushSync(() => setIsDownloading(true));
    try {
      const res = await fetch(job.videoUrl);
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
      window.open(job.videoUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  }, [job.videoUrl, job.topic]);

  const handleExport = useCallback(() => {
    flushSync(() => setIsExporting(true));
    onExport();
    // Reset after a short delay — the parent will take over with its own rendering state
    setTimeout(() => setIsExporting(false), 1500);
  }, [onExport]);

  if (job.stage === "rendering" && job.status !== "failed") {
    return (
      <Button
        size="sm"
        className="h-7 gap-1 gradient-primary rounded-lg text-primary-foreground font-semibold text-xs px-2.5"
        disabled
      >
        <Loader2 className="size-3 animate-spin" />
        Rendering…
      </Button>
    );
  }

  if (job.stage === "done" && job.codeChanged === false) {
    return (
      <Button
        size="sm"
        className="h-7 gap-1 gradient-primary rounded-lg text-primary-foreground font-semibold text-xs px-2.5"
        onClick={handleDirectDownload}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Download className="size-3" />
        )}
        Download
      </Button>
    );
  }

  // preview stage, or done + codeChanged=true — both trigger a re-render via onExport
  if (job.stage === "preview" || (job.stage === "done" && job.codeChanged)) {
    return (
      <Button
        size="sm"
        className="h-7 gap-1 gradient-primary rounded-lg text-primary-foreground font-semibold text-xs px-2.5"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <>
            <Download className="size-3" />
            Download
            <RefreshCw className="size-2.5 opacity-70" />
          </>
        )}
      </Button>
    );
  }

  return null;
}

export { SmartDownloadButton };
export type { SmartDownloadButtonProps };
