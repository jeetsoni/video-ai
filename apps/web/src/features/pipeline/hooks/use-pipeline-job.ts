"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineJobDto, PipelineStatus } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";

const DEFAULT_POLL_INTERVAL_MS = 3_000;

const TERMINAL_STATUSES: ReadonlySet<PipelineStatus> = new Set<PipelineStatus>([
  "completed",
  "failed",
  "awaiting_script_review",
]);

export interface UsePipelineJobOptions {
  /** Pipeline repository instance for fetching job status. */
  repository: PipelineRepository;
  /** Job ID to poll. */
  jobId: string;
  /** Polling interval in milliseconds. Defaults to 3 000 ms. */
  intervalMs?: number;
  /** Whether polling is enabled. Defaults to true. */
  enabled?: boolean;
}

export interface UsePipelineJobResult {
  /** Latest job data, or null if not yet fetched. */
  job: PipelineJobDto | null;
  /** Whether the initial fetch is still in progress. */
  isLoading: boolean;
  /** Error from the most recent fetch attempt, if any. */
  error: Error | null;
  /** Manually trigger a single refetch. */
  refetch: () => Promise<void>;
  /** Restart the polling loop (e.g. after a regenerate action). */
  restartPolling: () => void;
}

export function usePipelineJob({
  repository,
  jobId,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
}: UsePipelineJobOptions): UsePipelineJobResult {
  const [job, setJob] = useState<PipelineJobDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchJob = useCallback(async () => {
    try {
      const data = await repository.getJobStatus(jobId);
      if (mountedRef.current) {
        setJob(data);
        setError(null);
      }
      return data;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [repository, jobId]);

  const refetch = useCallback(async () => {
    await fetchJob();
  }, [fetchJob]);

  const restartPolling = useCallback(() => {
    setPollGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function poll() {
      const data = await fetchJob();

      if (cancelled) return;

      // Stop polling when the job reaches a terminal or review state
      if (data && TERMINAL_STATUSES.has(data.status)) return;

      timerRef.current = setTimeout(poll, intervalMs);
    }

    poll();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchJob, intervalMs, enabled, pollGeneration]);

  return { job, isLoading, error, refetch, restartPolling };
}
