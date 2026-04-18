"use client";

import type { PipelineStage, PipelineStatus } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import { Progress } from "@/shared/components/ui/progress";

const STAGES: { value: PipelineStage; label: string }[] = [
  { value: "script_generation", label: "Script Gen" },
  { value: "script_review", label: "Script Review" },
  { value: "tts_generation", label: "TTS" },
  { value: "transcription", label: "Transcription" },
  { value: "timestamp_mapping", label: "Timestamp Map" },
  { value: "direction_generation", label: "Direction" },
  { value: "code_generation", label: "Code Gen" },
  { value: "rendering", label: "Rendering" },
  { value: "done", label: "Done" },
];

type StageState = "pending" | "active" | "review" | "complete" | "failed";

function getStageState(
  stageValue: PipelineStage,
  currentStage: PipelineStage,
  status: PipelineStatus,
): StageState {
  const stageIndex = STAGES.findIndex((s) => s.value === stageValue);
  const currentIndex = STAGES.findIndex((s) => s.value === currentStage);

  if (stageIndex < currentIndex) return "complete";

  if (stageIndex === currentIndex) {
    if (status === "failed") return "failed";
    if (
      status === "awaiting_script_review"
    )
      return "review";
    if (status === "completed") return "complete";
    return "active";
  }

  return "pending";
}

const STATE_CLASSES: Record<StageState, string> = {
  pending: "bg-stage-pending/20 text-stage-pending",
  active: "bg-stage-active/20 text-stage-active",
  review: "bg-stage-review/20 text-stage-review",
  complete: "bg-stage-complete/20 text-stage-complete",
  failed: "bg-stage-failed/20 text-stage-failed",
};

const DOT_CLASSES: Record<StageState, string> = {
  pending: "bg-stage-pending",
  active: "bg-stage-active",
  review: "bg-stage-review",
  complete: "bg-stage-complete",
  failed: "bg-stage-failed",
};

interface JobStatusTrackerProps {
  stage: PipelineStage;
  status: PipelineStatus;
  progressPercent: number;
}

export function JobStatusTracker({
  stage,
  status,
  progressPercent,
}: JobStatusTrackerProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const state = getStageState(s.value, stage, status);
          return (
            <div
              key={s.value}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                STATE_CLASSES[state],
              )}
            >
              <span
                className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT_CLASSES[state])}
                aria-hidden="true"
              />
              {s.label}
            </div>
          );
        })}
      </div>
      <Progress value={progressPercent} aria-label="Pipeline progress" />
    </div>
  );
}
