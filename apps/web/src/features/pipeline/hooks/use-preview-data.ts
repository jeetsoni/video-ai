"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PipelineStage, ScenePlan } from "@video-ai/shared";
import type React from "react";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import type { PreviewDataResponse } from "../types/pipeline.types";
import { evaluateComponentCode } from "../utils/code-evaluator";

const PREVIEW_ELIGIBLE_STAGES: ReadonlySet<PipelineStage> = new Set([
  "preview",
  "rendering",
  "done",
]);

export const AUDIO_URL_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export const NULL_AUDIO_POLL_INTERVAL_MS = 10_000;
export const NULL_AUDIO_MAX_POLLS = 30;
export const AUDIO_ERROR_REFETCH_COOLDOWN_MS = 5_000;

export interface UsePreviewDataOptions {
  /** Pipeline repository instance for fetching preview data. */
  repository: PipelineRepository;
  /** Job ID to fetch preview data for. */
  jobId: string;
  /** Current pipeline stage. Only fetches when stage is preview, rendering, or done. */
  stage: PipelineStage | undefined;
}

export interface UsePreviewDataResult {
  /** Raw preview data from the API, or null if not yet fetched. */
  previewData: PreviewDataResponse | null;
  /** Evaluated React component from the generated code, or null. */
  evaluatedComponent: React.ComponentType<{ scenePlan: ScenePlan }> | null;
  /** Whether the initial fetch is still in progress. */
  isLoading: boolean;
  /** Error from fetch or code evaluation, if any. */
  error: string | null;
  /** Manually trigger a refetch of preview data. */
  refetch: () => Promise<void>;
  /** Whether a client-side audio load error has occurred. */
  audioLoadError: boolean;
  /** Manually refresh the audio URL with a 5s cooldown. Clears audioLoadError on success. */
  refreshAudioUrl: () => void;
}

export function usePreviewData({
  repository,
  jobId,
  stage,
}: UsePreviewDataOptions): UsePreviewDataResult {
  const [previewData, setPreviewData] = useState<PreviewDataResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLoadError, setAudioLoadError] = useState(false);

  const mountedRef = useRef(true);
  const nullAudioPollCountRef = useRef(0);
  const lastRefreshTimestampRef = useRef(0);

  const enabled = stage != null && PREVIEW_ELIGIBLE_STAGES.has(stage);

  const fetchPreviewData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await repository.getPreviewData(jobId);
      if (mountedRef.current) {
        setPreviewData(data);
        if (data.audioUrl != null) {
          setAudioLoadError(false);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [repository, jobId]);

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    fetchPreviewData();

    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchPreviewData]);

  // Periodic re-fetch to keep signed URLs fresh (recursive setTimeout)
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleRefresh = () => {
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        await fetchPreviewData();
        if (!cancelled) {
          scheduleRefresh();
        }
      }, AUDIO_URL_REFRESH_INTERVAL_MS);
    };

    scheduleRefresh();

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [enabled, fetchPreviewData]);

  // Null-audio polling: when audioUrl is null and audioError is false, poll every 10s
  useEffect(() => {
    if (!enabled) return;
    if (previewData === null) return;
    if (previewData.audioUrl != null) return;
    if (previewData.audioError) return;

    nullAudioPollCountRef.current = 0;

    const intervalId = setInterval(() => {
      nullAudioPollCountRef.current += 1;
      if (nullAudioPollCountRef.current >= NULL_AUDIO_MAX_POLLS) {
        clearInterval(intervalId);
        return;
      }
      fetchPreviewData();
    }, NULL_AUDIO_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    enabled,
    previewData?.audioUrl,
    previewData?.audioError,
    previewData,
    fetchPreviewData,
  ]);

  const refreshAudioUrl = useCallback(() => {
    const now = Date.now();
    if (
      now - lastRefreshTimestampRef.current <
      AUDIO_ERROR_REFETCH_COOLDOWN_MS
    ) {
      return;
    }
    lastRefreshTimestampRef.current = now;
    setAudioLoadError(false);
    fetchPreviewData();
  }, [fetchPreviewData]);

  const evaluated = useMemo(() => {
    if (!previewData?.code) return { component: null, evalError: null };

    const result = evaluateComponentCode(previewData.code);
    return { component: result.component, evalError: result.error };
  }, [previewData?.code]);

  const combinedError = error ?? evaluated.evalError;

  return {
    previewData,
    evaluatedComponent: evaluated.component,
    isLoading,
    error: combinedError,
    refetch: fetchPreviewData,
    audioLoadError,
    refreshAudioUrl,
  };
}
