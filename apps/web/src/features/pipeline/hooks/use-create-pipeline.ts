"use client";

import { useCallback, useState } from "react";
import type { VideoFormat } from "@video-ai/shared";
import { DEFAULT_THEME_ID } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import type { CreateJobResponse } from "../types/pipeline.types";

export interface UseCreatePipelineOptions {
  /** Pipeline repository instance for creating jobs. */
  repository: PipelineRepository;
  /** Callback invoked after a job is successfully created. */
  onSuccess?: (response: CreateJobResponse) => void;
  /** Callback invoked when job creation fails. */
  onError?: (error: Error) => void;
}

export interface UseCreatePipelineResult {
  /** Current topic value. */
  topic: string;
  /** Update the topic. */
  setTopic: (value: string) => void;
  /** Currently selected video format, or null if none selected. */
  format: VideoFormat | null;
  /** Update the selected format. */
  setFormat: (value: VideoFormat | null) => void;
  /** Currently selected theme ID, or null for default. */
  themeId: string | null;
  /** Update the selected theme. */
  setThemeId: (value: string | null) => void;
  /** Whether a submission is in flight. */
  isSubmitting: boolean;
  /** Error from the most recent submission attempt, if any. */
  error: Error | null;
  /** Submit the form. Requires topic and format to be set. */
  submit: () => Promise<void>;
  /** Reset all form state to initial values. */
  reset: () => void;
}

export function useCreatePipeline({
  repository,
  onSuccess,
  onError,
}: UseCreatePipelineOptions): UseCreatePipelineResult {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<VideoFormat | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submit = useCallback(async () => {
    if (!format) {
      const err = new Error("Please select a video format");
      setError(err);
      onError?.(err);
      return;
    }

    const trimmed = topic.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      const err = new Error("Topic must be between 3 and 500 characters");
      setError(err);
      onError?.(err);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await repository.createJob({
        topic: trimmed,
        format,
        themeId: themeId ?? DEFAULT_THEME_ID,
      });
      onSuccess?.(response);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      onError?.(wrapped);
    } finally {
      setIsSubmitting(false);
    }
  }, [repository, topic, format, themeId, onSuccess, onError]);

  const reset = useCallback(() => {
    setTopic("");
    setFormat(null);
    setThemeId(null);
    setError(null);
    setIsSubmitting(false);
  }, []);

  return {
    topic,
    setTopic,
    format,
    setFormat,
    themeId,
    setThemeId,
    isSubmitting,
    error,
    submit,
    reset,
  };
}
