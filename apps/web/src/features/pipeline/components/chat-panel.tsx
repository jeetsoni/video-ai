"use client";

import { useCallback } from "react";
import type { RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import type { PipelineJobDto } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { useTweakChat } from "../hooks/use-tweak-chat";
import { ChatPanelLayout } from "./chat-panel-layout";

export interface ChatPanelProps {
  job: PipelineJobDto;
  repository: PipelineRepository;
  playerRef: RefObject<PlayerRef | null>;
  playerContainerRef: RefObject<HTMLElement | null>;
  fps: number;
  onCodeUpdated: () => void;
}

export function ChatPanel({ job, repository, playerRef, playerContainerRef, fps, onCodeUpdated }: ChatPanelProps) {
  const { messages, sendMessage, isLoading, isFetchingHistory } = useTweakChat({
    repository,
    jobId: job.id,
    playerRef,
    playerContainerRef,
    fps,
    onCodeUpdated,
  });

  const handleSend = useCallback(async (text: string) => {
    await sendMessage(text);
  }, [sendMessage]);

  return (
    <ChatPanelLayout
      messages={messages}
      isLoading={isLoading}
      isFetchingHistory={isFetchingHistory}
      placeholder="Describe a tweak…"
      emptyTitle="Describe a tweak to your animation"
      emptyHint={'e.g. "Make the title text larger" or "Speed up the intro"'}
      onSend={handleSend}
    />
  );
}
