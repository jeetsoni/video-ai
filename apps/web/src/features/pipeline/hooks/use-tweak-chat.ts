"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import type { TweakMessageDto } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { capturePlayerScreenshot } from "../utils/screenshot-capture";

export interface UseTweakChatOptions {
  /** Pipeline repository instance for API calls. */
  repository: PipelineRepository;
  /** Job ID for the current pipeline job. */
  jobId: string;
  /** Ref to the Remotion player for reading current frame/time. */
  playerRef: RefObject<PlayerRef | null>;
  /** Ref to the player container element for screenshot capture. */
  playerContainerRef: RefObject<HTMLElement | null>;
  /** Frames per second — used to compute time in seconds from the current frame. */
  fps: number;
  /** Callback invoked after a successful tweak so the caller can re-evaluate code. */
  onCodeUpdated: () => void;
}

export interface UseTweakChatResult {
  /** All chat messages (fetched + optimistic). */
  messages: TweakMessageDto[];
  /** Send a new tweak message. */
  sendMessage: (text: string) => Promise<void>;
  /** Whether a tweak request is currently in flight. */
  isLoading: boolean;
  /** Whether the initial message fetch is in progress. */
  isFetchingHistory: boolean;
  /** Most recent error, if any. */
  error: string | null;
}

let optimisticIdCounter = 0;

function createOptimisticMessage(
  jobId: string,
  role: "user" | "assistant",
  content: string,
): TweakMessageDto {
  optimisticIdCounter += 1;
  return {
    id: `optimistic-${optimisticIdCounter}`,
    jobId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function useTweakChat({
  repository,
  jobId,
  playerRef,
  playerContainerRef,
  fps,
  onCodeUpdated,
}: UseTweakChatOptions): UseTweakChatResult {
  const [messages, setMessages] = useState<TweakMessageDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // Fetch existing messages on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function fetchMessages() {
      setIsFetchingHistory(true);
      try {
        const history = await repository.getTweakMessages(jobId);
        if (!cancelled && mountedRef.current) {
          setMessages(history);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to load chat history",
          );
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsFetchingHistory(false);
        }
      }
    }

    fetchMessages();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [repository, jobId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsLoading(true);
      setError(null);

      // 1. Capture screenshot (graceful degradation — null on failure)
      const screenshot = await capturePlayerScreenshot(playerContainerRef);

      // 2. Read current frame and compute time from the Remotion PlayerRef
      let frame: number | undefined;
      let timeSeconds: number | undefined;

      const player = playerRef.current;
      if (player) {
        try {
          frame = player.getCurrentFrame();
          if (frame != null && fps > 0) {
            timeSeconds = frame / fps;
          }
        } catch {
          // PlayerRef may not be ready — proceed without timeline context
        }
      }

      // 3. Add optimistic user message
      const userMessage = createOptimisticMessage(jobId, "user", text);
      setMessages((prev) => [...prev, userMessage]);

      // 4. Call the API
      try {
        const response = await repository.sendTweak({
          jobId,
          message: text,
          screenshot: screenshot ?? undefined,
          frame,
          timeSeconds,
        });

        if (!mountedRef.current) return;

        // 5. On success: add assistant message and notify caller
        const assistantMessage = createOptimisticMessage(
          jobId,
          "assistant",
          response.explanation,
        );
        setMessages((prev) => [...prev, assistantMessage]);
        onCodeUpdated();
      } catch (err) {
        if (!mountedRef.current) return;

        // 6. On error: add error message to chat
        const errorText =
          err instanceof Error ? err.message : "Something went wrong";
        setError(errorText);

        const errorMessage = createOptimisticMessage(
          jobId,
          "assistant",
          `Error: ${errorText}`,
        );
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [repository, jobId, playerRef, playerContainerRef, fps, onCodeUpdated],
  );

  return {
    messages,
    sendMessage,
    isLoading,
    isFetchingHistory,
    error,
  };
}
