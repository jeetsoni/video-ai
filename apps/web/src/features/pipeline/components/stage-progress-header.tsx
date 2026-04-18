"use client";

import type { PipelineStage, PipelineStatus } from "@video-ai/shared";
import { CheckCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getStageDisplayInfo } from "@/features/pipeline/utils/stage-display-map";

interface StageProgressHeaderProps {
  stage: PipelineStage;
  status: PipelineStatus;
  progressPercent: number;
}

export function StageProgressHeader({
  stage,
  status,
  progressPercent,
}: StageProgressHeaderProps) {
  const displayInfo = getStageDisplayInfo(stage);
  const Icon = displayInfo.icon;
  const isCompleted = status === "completed";
  const clamped = Math.min(100, Math.max(0, progressPercent));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            isCompleted
              ? "bg-stage-complete/20 text-stage-complete"
              : "bg-stage-active/20 text-stage-active",
          )}
        >
          {isCompleted ? (
            <CheckCircle className="size-5" />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            {displayInfo.label}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {isCompleted ? "Video ready!" : displayInfo.description}
          </p>
        </div>
      </div>

      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pipeline progress"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            isCompleted ? "bg-stage-complete" : "gradient-primary",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
