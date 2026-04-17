"use client";

import type { SceneBoundary } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";

const TYPE_COLORS: Record<SceneBoundary["type"], string> = {
  Hook: "bg-cyan-500",
  Analogy: "bg-amber-500",
  Bridge: "bg-emerald-500",
  Architecture: "bg-violet-500",
  Spotlight: "bg-rose-500",
  Comparison: "bg-blue-500",
  Power: "bg-orange-500",
  CTA: "bg-pink-500",
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
        className="flex h-10 w-full overflow-hidden rounded-lg"
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
                "flex items-center justify-center overflow-hidden border-r border-background/30 last:border-r-0",
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
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
