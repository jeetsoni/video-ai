"use client";

import type { PipelineJobDto, PipelineStatus } from "@video-ai/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";

const STATUS_BADGE: Record<
  PipelineStatus,
  { label: string; variant: "secondary" | "default" | "outline" | "destructive"; className?: string }
> = {
  pending: { label: "Pending", variant: "secondary" },
  processing: { label: "Processing", variant: "default", className: "bg-primary/20 text-primary" },
  awaiting_script_review: { label: "Script Review", variant: "secondary", className: "bg-secondary/20 text-secondary" },
  awaiting_scene_plan_review: { label: "Scene Review", variant: "secondary", className: "bg-secondary/20 text-secondary" },
  completed: { label: "Completed", variant: "default", className: "bg-stage-complete/20 text-stage-complete" },
  failed: { label: "Failed", variant: "destructive" },
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

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

interface JobListTableProps {
  jobs: PipelineJobDto[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onJobClick: (jobId: string) => void;
}

export function JobListTable({
  jobs,
  total,
  page,
  limit,
  onPageChange,
  onJobClick,
}: JobListTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-on-surface-variant">
                No jobs found.
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((job) => {
              const badge = STATUS_BADGE[job.status];
              return (
                <TableRow key={job.id}>
                  <TableCell className="max-w-[200px]" title={job.topic}>
                    {truncate(job.topic, 50)}
                  </TableCell>
                  <TableCell className="capitalize">{job.format}</TableCell>
                  <TableCell>
                    <Badge variant={badge.variant} className={cn(badge.className)}>
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatStage(job.stage)}</TableCell>
                  <TableCell>{formatDate(job.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => onJobClick(job.id)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-on-surface-variant">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
