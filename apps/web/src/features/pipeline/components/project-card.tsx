"use client";

import type { PipelineJobDto, PipelineStatus } from "@video-ai/shared";
import { Film } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { cn } from "@/shared/lib/utils";

const STATUS_CONFIG: Record<
  PipelineStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-on-surface-variant/20 text-on-surface-variant",
  },
  processing: {
    label: "Processing",
    className: "bg-primary/20 text-primary",
    pulse: true,
  },
  awaiting_script_review: {
    label: "Script Review",
    className: "bg-secondary/20 text-secondary",
  },
  awaiting_scene_plan_review: {
    label: "Scene Review",
    className: "bg-secondary/20 text-secondary",
  },
  completed: {
    label: "Completed",
    className: "bg-stage-complete/20 text-stage-complete",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/20 text-destructive",
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStage(stage: string): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface ProjectCardProps {
  job: PipelineJobDto;
  onClick: (jobId: string) => void;
}

export function ProjectCard({ job, onClick }: ProjectCardProps) {
  const config = STATUS_CONFIG[job.status];
  const isProcessing = job.status === "processing";

  return (
    <button
      type="button"
      onClick={() => onClick(job.id)}
      className="group w-full rounded-xl bg-surface-container-low text-left transition-all duration-300 hover:bg-surface-container border border-outline-variant hover:border-primary/20 overflow-hidden"
    >
      <div className="relative aspect-video overflow-hidden bg-surface-container-high flex items-center justify-center">
        {job.videoUrl ? (
          <video
            src={job.videoUrl}
            className="size-full object-cover group-hover:scale-105 transition-transform duration-500"
            muted
          />
        ) : (
          <Film className="size-8 text-on-surface-variant/30" />
        )}

        <div className="absolute top-3 left-3">
          <Badge
            variant="ghost"
            className={cn(
              "rounded-sm text-[10px] font-bold uppercase tracking-wider backdrop-blur-md",
              config.className,
            )}
          >
            {config.pulse && (
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
            )}
            {config.label}
          </Badge>
        </div>
      </div>

      <div className="space-y-2 p-4">
        <h3 className="text-sm font-bold text-on-surface line-clamp-1">
          {job.topic}
        </h3>

        {isProcessing ? (
          <div className="space-y-1">
            <Progress value={job.progressPercent} className="h-1" />
            <p className="text-[10px] text-on-surface-variant">
              {formatStage(job.stage)} · {job.progressPercent}%
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-on-surface-variant font-medium">
            {formatDate(job.createdAt)}
            {job.format && ` · ${job.format}`}
          </p>
        )}
      </div>
    </button>
  );
}
