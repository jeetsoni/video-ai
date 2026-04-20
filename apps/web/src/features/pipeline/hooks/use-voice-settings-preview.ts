"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceSettings } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";

const COOLDOWN_SECONDS = 3;

export interface UseVoiceSettingsPreviewResult {
  isLoading: boolean;
  isPlaying: boolean;
  error: string | null;
  cooldownRemaining: number;
  requestPreview: (params: {
    voiceId?: string;
    voiceSettings: VoiceSettings;
    text?: string;
  }) => void;
  stopPlayback: () => void;
}

export function useVoiceSettingsPreview(
  pipelineRepository: PipelineRepository,
): UseVoiceSettingsPreviewResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const startCooldown = useCallback(() => {
    setCooldownRemaining(COOLDOWN_SECONDS);

    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
    }

    cooldownIntervalRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
            cooldownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setIsPlaying(false);
  }, []);

  const requestPreview = useCallback(
    (params: { voiceId?: string; voiceSettings: VoiceSettings; text?: string }) => {
      // Stop current playback if playing
      stopPlayback();

      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setError(null);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      pipelineRepository
        .previewVoice({
          voiceId: params.voiceId,
          voiceSettings: params.voiceSettings,
          text: params.text,
        })
        .then((blob: Blob) => {
          if (controller.signal.aborted) return;

          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;

          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            setIsPlaying(false);
          };

          audio.onerror = () => {
            setIsPlaying(false);
            setError("Playback failed. Please try again.");
          };

          setIsLoading(false);
          setIsPlaying(true);
          startCooldown();

          audio.play().catch(() => {
            setIsPlaying(false);
            setError("Playback failed. Please try again.");
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;

          setIsLoading(false);
          setError(
            err instanceof Error
              ? err.message
              : "Preview generation failed. Please try again.",
          );
        });
    },
    [pipelineRepository, stopPlayback, startCooldown],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();

      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [cleanup]);

  return {
    isLoading,
    isPlaying,
    error,
    cooldownRemaining,
    requestPreview,
    stopPlayback,
  };
}
