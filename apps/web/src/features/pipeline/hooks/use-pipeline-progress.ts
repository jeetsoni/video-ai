"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineJobDto, ProgressEvent } from "@video-ai/shared";
import { isTerminalStatus } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { SSEClient } from "@/shared/services/sse-client";
import { getBrowserId } from "@/shared/lib/browser-id";

export interface UsePipelineProgressOptions {
  /** Pipeline repository instance for fetching job status. */
  repository: PipelineRepository;
  /** Job ID to track. */
  jobId: string;
  /** Base URL for the API (used to construct the SSE endpoint). */
  apiBaseUrl: string;
}

export interface UsePipelineProgressResult {
  /** Latest job data, or null if not yet fetched. */
  job: PipelineJobDto | null;
  /** Whether the initial fetch is still in progress. */
  isLoading: boolean;
  /** Error from the most recent fetch or SSE connection, if any. */
  error: Error | null;
  /** Manually trigger a single refetch. */
  refetch: () => Promise<void>;
  /** Close existing SSE, refetch, and open new SSE if not terminal. */
  reconnect: () => void;
}

function parseProgressEvent(data: string): ProgressEvent {
  return JSON.parse(data) as ProgressEvent;
}

export function usePipelineProgress({
  repository,
  jobId,
  apiBaseUrl,
}: UsePipelineProgressOptions): UsePipelineProgressResult {
  const [job, setJob] = useState<PipelineJobDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [generation, setGeneration] = useState(0);

  const sseClientRef = useRef<SSEClient<ProgressEvent> | null>(null);
  const mountedRef = useRef(true);

  const closeSSE = useCallback(() => {
    if (sseClientRef.current) {
      sseClientRef.current.close();
      sseClientRef.current = null;
    }
  }, []);

  const fetchJob = useCallback(async (): Promise<PipelineJobDto | null> => {
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

  const reconnect = useCallback(() => {
    closeSSE();
    setGeneration((g) => g + 1);
  }, [closeSSE]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const data = await fetchJob();

      if (cancelled || !data) return;

      // If already terminal, no need for SSE
      if (isTerminalStatus(data.status)) return;

      // Open SSE connection
      const url = `${apiBaseUrl}/api/pipeline/jobs/${jobId}/progress`;
      const client = new SSEClient<ProgressEvent>({
        url,
        parseEvent: parseProgressEvent,
        headers: { "X-Browser-Id": getBrowserId() },
      });
      sseClientRef.current = client;

      try {
        for await (const event of client.connect()) {
          if (cancelled) return;

          // Merge progress fields into existing job state
          setJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              stage: event.data.stage,
              status: event.data.status,
              progressPercent: event.data.progressPercent,
              ...(event.data.errorCode ? { errorCode: event.data.errorCode } : {}),
              ...(event.data.errorMessage ? { errorMessage: event.data.errorMessage } : {}),
            };
          });

          // Close on terminal status
          if (isTerminalStatus(event.data.status)) {
            client.close();
            sseClientRef.current = null;
            return;
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      closeSSE();
    };
  }, [fetchJob, jobId, apiBaseUrl, closeSSE, generation]);

  return { job, isLoading, error, refetch, reconnect };
}
