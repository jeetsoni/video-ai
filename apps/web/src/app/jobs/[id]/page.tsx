"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SceneBoundary, VoiceEntry, VoiceSettings } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { usePipelineProgress } from "@/features/pipeline/hooks/use-pipeline-progress";
import { useStreamingScript } from "@/features/pipeline/hooks/use-streaming-script";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { JobStatusTracker } from "@/features/pipeline/components/job-status-tracker";
import { ScriptReviewEditor } from "@/features/pipeline/components/script-review-editor";
import { VideoPreviewPage } from "@/features/pipeline/components/video-preview-page";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { pipelineRepository, configService } = useAppDependencies();

  const handleBack = useCallback(() => router.push("/"), [router]);

  const { job, isLoading, error, refetch, reconnect, sceneProgress, completedSceneCodes } = usePipelineProgress({
    repository: pipelineRepository,
    jobId: id,
    apiBaseUrl: configService.getApiBaseUrl(),
  });

  // Fetch available voices for the script review page
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    pipelineRepository
      .listVoices()
      .then((res) => {
        if (!cancelled) setVoices(res.voices);
      })
      .catch(() => {
        // Voice list fetch failed — VoiceSelector handles empty state
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineRepository]);

  // Always call the streaming hook (React rules of hooks — no conditional calls).
  // The hook internally checks job stage and skips SSE when the job is already complete.
  const {
    script: streamedScript,
    scenes: streamedScenes,
    status: streamingStatus,
    statusMessage: streamingStatusMessage,
    error: streamingError,
  } = useStreamingScript({
    jobId: id,
    apiBaseUrl: configService.getApiBaseUrl(),
  });

  const handleApproveScript = useCallback(
    async (editedScript?: string, scenes?: SceneBoundary[], voiceId?: string, voiceSettings?: VoiceSettings) => {
      await pipelineRepository.approveScript({
        jobId: id,
        script: editedScript,
        scenes,
        voiceId,
        voiceSettings,
      });
      reconnect();
    },
    [pipelineRepository, id, reconnect],
  );

  // Refetch job data when streaming completes so the backend status
  // is up-to-date (script_review) before the user can approve.
  useEffect(() => {
    if (streamingStatus === "complete") {
      refetch();
    }
  }, [streamingStatus, refetch]);

  const handleRegenerateScript = useCallback(async () => {
    await pipelineRepository.regenerateScript(id);
    reconnect();
  }, [pipelineRepository, id, reconnect]);

  const handleRetryJob = useCallback(async () => {
    await pipelineRepository.retryJob(id);
    reconnect();
  }, [pipelineRepository, id, reconnect]);

  const handleExport = useCallback(async () => {
    await pipelineRepository.exportVideo(id);
    reconnect();
  }, [pipelineRepository, id, reconnect]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <button type="button" onClick={handleBack} className="mb-6 flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft className="size-4" />
          Back
        </button>
        <p className="text-on-surface-variant">Loading job…</p>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <button type="button" onClick={handleBack} className="mb-6 flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft className="size-4" />
          Back
        </button>
        <p className="text-destructive">
          {error?.message ?? "Job not found"}
        </p>
      </main>
    );
  }

  // Streaming error: show error message with retry button (only for script_generation stage)
  if (streamingStatus === "error" && job.stage === "script_generation") {
    return (
      <main className="flex h-[calc(100vh-4rem)] items-center justify-center p-10">
        <div className="w-full max-w-md rounded-xl bg-destructive/10 p-8 text-center">
          <button type="button" onClick={handleBack} className="mb-4 flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
            <ArrowLeft className="size-4" />
            Back
          </button>
          <h2 className="text-lg font-semibold text-destructive">
            Script generation failed
          </h2>
          {streamingError && (
            <p className="mt-2 text-sm text-destructive/80">{streamingError}</p>
          )}
          <Button
            className="mt-6 gap-2"
            onClick={handleRegenerateScript}
          >
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </main>
    );
  }

  // Streaming view: job is in script_generation stage and the hook is
  // loading (initializing SSE), actively streaming, or has just completed.
  // Include "loading" so the script review editor shows immediately with a
  // loading state instead of flashing the status tracker screen.
  const isStreamingActive =
    job.stage === "script_generation" &&
    (streamingStatus === "loading" || streamingStatus === "researching" || streamingStatus === "streaming" || streamingStatus === "complete");

  // Also show the streaming-sourced editor when the hook completed and the
  // job is at script_review (just transitioned after streaming finished).
  const isStreamingComplete =
    streamingStatus === "complete" &&
    streamedScript.length > 0 &&
    (job.stage === "script_generation" || job.stage === "script_review");

  // Existing DB-loaded script review path (job already at script_review with data from polling)
  const isDbScriptReview =
    job.status === "awaiting_script_review" && !!job.generatedScript;

  // Render the ScriptReviewEditor when streaming is active/complete OR when
  // the hook resolved from DB for a completed job.
  if (isStreamingActive || isStreamingComplete || isDbScriptReview) {
    // Prefer streaming data when available; fall back to DB-loaded data from usePipelineProgress
    const script = streamedScript.length > 0 ? streamedScript : (job.generatedScript ?? "");
    const scenes = streamedScenes.length > 0 ? streamedScenes : (job.generatedScenes ?? []);
    const isStreaming = streamingStatus === "streaming" || streamingStatus === "loading" || streamingStatus === "researching";

    return (
      <main className="flex h-[calc(100vh-4rem)] flex-col p-10">
        <ScriptReviewEditor
          script={script}
          format={job.format}
          topic={job.topic}
          scenes={scenes}
          onApprove={handleApproveScript}
          onRegenerate={handleRegenerateScript}
          onBack={handleBack}
          isLoading={isStreaming}
          statusMessage={streamingStatusMessage}
          voices={voices}
          voicesLoading={voicesLoading}
          initialVoiceId={job.voiceId}
          initialVoiceSettings={job.voiceSettings}
        />
      </main>
    );
  }

  // Route to VideoPreviewPage when the job has moved past script_review
  // (Requirement 1.1, 1.2, 1.3)
  const isPastScriptReview =
    job.stage !== "script_generation" && job.stage !== "script_review";

  if (isPastScriptReview) {
    return (
      <main>
        <VideoPreviewPage
          job={job}
          onRetry={handleRegenerateScript}
          onRetryJob={handleRetryJob}
          onBack={handleBack}
          pollingError={error}
          onRefresh={reconnect}
          onExport={handleExport}
          repository={pipelineRepository}
          sceneProgress={sceneProgress}
          completedSceneCodes={completedSceneCodes}
        />
      </main>
    );
  }

  // Generic fallback for early stages (e.g. script_generation before streaming kicks in)
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      <button type="button" onClick={handleBack} className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
        <ArrowLeft className="size-4" />
        Back
      </button>
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
          <Button
            className="mt-4 gap-2"
            onClick={handleRetryJob}
          >
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </section>
      )}
    </main>
  );
}
