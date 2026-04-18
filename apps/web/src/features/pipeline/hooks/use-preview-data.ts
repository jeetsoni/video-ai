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
}

export function usePreviewData({
  repository,
  jobId,
  stage,
}: UsePreviewDataOptions): UsePreviewDataResult {
  const [previewData, setPreviewData] = useState<PreviewDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const enabled = stage != null && PREVIEW_ELIGIBLE_STAGES.has(stage);

  const fetchPreviewData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await repository.getPreviewData(jobId);
      if (mountedRef.current) {
        setPreviewData(data);
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

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    fetchPreviewData();

    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchPreviewData]);

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
  };
}
