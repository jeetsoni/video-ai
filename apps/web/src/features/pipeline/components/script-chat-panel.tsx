"use client";

import { useCallback } from "react";
import type { PipelineJobDto, SceneBoundary } from "@video-ai/shared";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { useScriptTweakChat } from "../hooks/use-script-tweak-chat";
import { ChatPanelLayout } from "./chat-panel-layout";

export interface ScriptChatPanelProps {
  job: PipelineJobDto;
  repository: PipelineRepository;
  onScriptUpdated: (newScript: string, newScenes: SceneBoundary[]) => void;
}

export function ScriptChatPanel({ job, repository, onScriptUpdated }: ScriptChatPanelProps) {
  const { messages, sendMessage, isLoading, isFetchingHistory } = useScriptTweakChat({
    repository,
    jobId: job.id,
    onScriptUpdated,
  });

  const handleSend = useCallback(async (text: string) => {
    await sendMessage(text);
  }, [sendMessage]);

  return (
    <ChatPanelLayout
      messages={messages}
      isLoading={isLoading}
      isFetchingHistory={isFetchingHistory}
      placeholder="Describe a change to your script"
      emptyTitle="Describe a change to your script"
      emptyHint={'e.g. "Make the intro more punchy" or "Add recent stats about AI"'}
      onSend={handleSend}
    />
  );
}
