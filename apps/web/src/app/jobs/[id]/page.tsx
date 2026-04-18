"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import type { SceneBoundary } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { usePipelineJob } from "@/features/pipeline/hooks/use-pipeline-job";
import { JobStatusTracker } from "@/features/pipeline/components/job-status-tracker";
import { ScriptReviewEditor } from "@/features/pipeline/components/script-review-editor";
import { Button } from "@/shared/components/ui/button";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { pipelineRepository } = useAppDependencies();

  const { job, isLoading, error, refetch } = usePipelineJob({
    repository: pipelineRepository,
    jobId: id,
  });

  const handleApproveScript = useCallback(
    async (editedScript?: string, scenes?: SceneBoundary[]) => {
      await pipelineRepository.approveScript({ jobId: id, script: editedScript, scenes });
      refetch();
    },
    [pipelineRepository, id, refetch],
  );

  const handleRegenerateScript = useCallback(async () => {
    await pipelineRepository.regenerateScript(id);
    refetch();
  }, [pipelineRepository, id, refetch]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-on-surface-variant">Loading job…</p>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-destructive">
          {error?.message ?? "Job not found"}
        </p>
      </main>
    );
  }

  const isScriptReview =
    job.status === "awaiting_script_review" && !!job.generatedScript;

  // Script review gets a full-width cinematic layout
  if (isScriptReview) {
    return (
      <main className="flex h-[calc(100vh-4rem)] flex-col p-10">
        <ScriptReviewEditor
          script={job.generatedScript!}
          format={job.format}
          topic={job.topic}
          scenes={job.generatedScenes}
          onApprove={handleApproveScript}
          onRegenerate={handleRegenerateScript}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">{job.topic}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {job.format} &middot; {job.themeId}
        </p>
      </div>

      <JobStatusTracker
        stage={job.stage}
        status={job.status}
        progressPercent={job.progressPercent}
      />

      {job.status === "completed" && job.videoUrl && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Your Video</h2>
          <video
            src={job.videoUrl}
            controls
            className="w-full rounded-lg"
            aria-label="Generated video"
          />
        </section>
      )}

      {job.status === "failed" && (
        <section className="rounded-xl bg-destructive/10 p-5">
          <p className="font-medium text-destructive">Pipeline failed</p>
          {job.errorMessage && (
            <p className="mt-1 text-sm text-destructive/80">{job.errorMessage}</p>
          )}
        </section>
      )}
    </main>
  );
}
