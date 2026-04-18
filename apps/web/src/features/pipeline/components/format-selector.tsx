"use client";

import type { VideoFormat } from "@video-ai/shared";
import { FORMAT_RESOLUTIONS } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";

interface FormatOption {
  value: VideoFormat;
  label: string;
  aspectRatio: string;
  durationRange: string;
}

function getAspectRatio(format: VideoFormat): string {
  const { width, height } = FORMAT_RESOLUTIONS[format];
  return width < height ? "9:16" : "16:9";
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: "reel", label: "Reel", aspectRatio: getAspectRatio("reel"), durationRange: "15–60s" },
  { value: "short", label: "Short", aspectRatio: getAspectRatio("short"), durationRange: "15–60s" },
  { value: "longform", label: "Longform", aspectRatio: getAspectRatio("longform"), durationRange: "1–10min" },
];

interface FormatSelectorProps {
  value: VideoFormat | null;
  onChange: (format: VideoFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {FORMAT_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <Card
            key={option.value}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(option.value);
              }
            }}
            className={cn(
              "cursor-pointer transition-all",
              isSelected
                ? "bg-surface-container-highest shadow-[0_0_0_2px_rgba(167,165,255,0.4)]"
                : "hover:bg-surface-container-high"
            )}
          >
            <CardHeader>
              <CardTitle className="text-base">{option.label}</CardTitle>
              <CardDescription>{option.aspectRatio}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-on-surface-variant">
                {option.durationRange}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
