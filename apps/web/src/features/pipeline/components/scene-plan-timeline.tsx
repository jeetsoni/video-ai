"use client";

import type { SceneBoundary } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";

const TYPE_COLORS: Record<SceneBoundary["type"], string> = {
  Hook: "bg-primary",
  Analogy: "bg-secondary",
  Bridge: "bg-[#5fffb0]",
  Architecture: "bg-primary-dim",
  Spotlight: "bg-destructive",
  Comparison: "bg-[#7c6aff]",
  Power: "bg-secondary",
  CTA: "bg-primary",
};

interface ScenePlanTimelineProps {
  scenes: SceneBoundary[];
  totalDuration: number;
}

export function ScenePlanTimeline({
  scenes,
  totalDuration,
}: ScenePlanTimelineProps) {
  if (totalDuration <= 0) return null;

  return (
    <div className="space-y-2">
      <div
        className="flex h-10 w-full gap-2 overflow-hidden rounded-xl"
        role="img"
        aria-label="Scene plan timeline"
      >
        {scenes.map((scene) => {
          const widthPercent =
            ((scene.endTime - scene.startTime) / totalDuration) * 100;

          return (
            <div
              key={scene.id}
              className={cn(
                "flex items-center justify-center overflow-hidden rounded-md",
                TYPE_COLORS[scene.type],
              )}
              style={{ width: `${widthPercent}%` }}
              title={`${scene.name} (${scene.type})`}
            >
              <span className="truncate px-1 text-xs font-medium text-white">
                {scene.name}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <span
              className={cn("inline-block h-2 w-2 rounded-full", color)}
              aria-hidden="true"
            />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
