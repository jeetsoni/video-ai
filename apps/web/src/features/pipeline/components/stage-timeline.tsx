"use client";

import type { PipelineStage, PipelineStatus } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import { getStageDisplayInfo } from "@/features/pipeline/utils/stage-display-map";

interface StageTimelineProps {
  stage: PipelineStage;
  status: PipelineStatus;
}

const TIMELINE_STAGES: PipelineStage[] = [
  "tts_generation",
  "transcription",
  "timestamp_mapping",
  "direction_generation",
  "code_generation",
  "preview",
  "rendering",
  "done",
];

type StageState = "completed" | "active" | "pending" | "failed";

function getStageState(
  stageValue: PipelineStage,
  currentStage: PipelineStage,
  status: PipelineStatus,
): StageState {
  const stageIndex = TIMELINE_STAGES.indexOf(stageValue);
  const currentIndex = TIMELINE_STAGES.indexOf(currentStage);

  if (stageIndex < currentIndex) return "completed";

  if (stageIndex === currentIndex) {
    if (status === "failed") return "failed";
    if (status === "completed") return "completed";
    return "active";
  }

  return "pending";
}

const NODE_CLASSES: Record<StageState, string> = {
  completed: "bg-stage-complete/20 text-stage-complete border-stage-complete/30",
  active: "bg-stage-active/20 text-stage-active border-stage-active/30",
  pending: "bg-surface-container-high text-on-surface-variant border-transparent",
  failed: "bg-stage-failed/20 text-stage-failed border-stage-failed/30",
};

const LINE_CLASSES: Record<StageState, string> = {
  completed: "bg-stage-complete/40",
  active: "bg-stage-active/40",
  pending: "bg-surface-container-high",
  failed: "bg-stage-failed/40",
};

const LABEL_CLASSES: Record<StageState, string> = {
  completed: "text-stage-complete",
  active: "text-on-surface",
  pending: "text-on-surface-variant",
  failed: "text-stage-failed",
};

export function StageTimeline({ stage, status }: StageTimelineProps) {
  return (
    <div className="flex flex-col gap-0" role="list" aria-label="Pipeline stages">
      {TIMELINE_STAGES.map((timelineStage, index) => {
        const state = getStageState(timelineStage, stage, status);
        const displayInfo = getStageDisplayInfo(timelineStage);
        const Icon = displayInfo.icon;
        const isLast = index === TIMELINE_STAGES.length - 1;

        return (
          <div key={timelineStage} role="listitem" className="flex gap-3">
            {/* Vertical track: node + connector line */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-300",
                  NODE_CLASSES[state],
                )}
              >
                <Icon className="size-4" />
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-4 transition-all duration-300",
                    LINE_CLASSES[state],
                  )}
                />
              )}
            </div>

            {/* Label + description */}
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium leading-8 transition-colors duration-300",
                  LABEL_CLASSES[state],
                )}
              >
                {displayInfo.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { TIMELINE_STAGES, getStageState };
export type { StageTimelineProps, StageState };
