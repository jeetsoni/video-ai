"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TweakMessageDto } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";

export interface UseScriptTweakChatOptions {
  /** Pipeline repository instance for API calls. */
  repository: PipelineRepository;
  /** Job ID for the current pipeline job. */
  jobId: string;
  /** Callback invoked after a successful tweak with the updated script text and scenes. */
  onScriptUpdated: (
    newScript: string,
    newScenes: import("@video-ai/shared").SceneBoundary[],
  ) => void;
}

export interface UseScriptTweakChatResult {
  /** All chat messages (fetched + optimistic). */
  messages: TweakMessageDto[];
  /** Send a new script tweak message. */
  sendMessage: (text: string) => Promise<void>;
  /** Whether a tweak request is currently in flight. */
  isLoading: boolean;
  /** Whether the initial message fetch is in progress. */
  isFetchingHistory: boolean;
  /** Most recent error, if any. */
  error: string | null;
}

function createOptimisticMessage(
  jobId: string,
  role: "user" | "assistant",
  content: string,
): TweakMessageDto {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    jobId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function useScriptTweakChat({
  repository,
  jobId,
  onScriptUpdated,
}: UseScriptTweakChatOptions): UseScriptTweakChatResult {
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
        const history = await repository.getScriptTweakMessages(jobId);
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

      // Add optimistic user message
      const userMessage = createOptimisticMessage(jobId, "user", text);
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await repository.sendScriptTweak({
          jobId,
          message: text,
        });

        if (!mountedRef.current) return;

        // On success: add assistant message and notify caller
        const assistantMessage = createOptimisticMessage(
          jobId,
          "assistant",
          response.explanation,
        );
        setMessages((prev) => [...prev, assistantMessage]);

        onScriptUpdated(response.updatedScript, response.updatedScenes);
      } catch (err) {
        if (!mountedRef.current) return;

        // On error: add error message to chat
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
    [repository, jobId, onScriptUpdated],
  );

  return {
    messages,
    sendMessage,
    isLoading,
    isFetchingHistory,
    error,
  };
}
