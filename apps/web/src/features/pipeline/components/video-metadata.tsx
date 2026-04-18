"use client";

import { Calendar, Download, Film, Palette } from "lucide-react";
import type { VideoFormat } from "@video-ai/shared";
import { ANIMATION_THEMES } from "@video-ai/shared";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

interface VideoMetadataProps {
  topic: string;
  format: VideoFormat;
  themeId: string;
  createdAt: string;
  videoUrl?: string;
}

const FORMAT_LABELS: Record<VideoFormat, string> = {
  reel: "Reel",
  short: "Short",
  longform: "Longform",
};

function resolveThemeName(themeId: string): string {
  return ANIMATION_THEMES.find((t) => t.id === themeId)?.name ?? themeId;
}

export function VideoMetadata({ topic, format, themeId, createdAt, videoUrl }: VideoMetadataProps) {
  const themeName = resolveThemeName(themeId);
  const formattedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-on-surface">{topic}</h3>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="gap-1.5">
          <Film className="size-3" />
          {FORMAT_LABELS[format]}
        </Badge>

        <span className={cn("flex items-center gap-1.5 text-sm text-on-surface-variant")}>
          <Palette className="size-3.5" />
          {themeName}
        </span>

        <span className={cn("flex items-center gap-1.5 text-sm text-on-surface-variant")}>
          <Calendar className="size-3.5" />
          {formattedDate}
        </span>
      </div>

      {videoUrl && (
        <Button variant="secondary" size="sm" className="gap-2" asChild>
          <a href={videoUrl} download>
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
      )}
    </div>
  );
}

export type { VideoMetadataProps };
