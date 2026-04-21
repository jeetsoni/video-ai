"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import { Loader2, Send } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { useTweakChat } from "../hooks/use-tweak-chat";

export interface ChatPanelProps {
  job: PipelineJobDto;
  repository: PipelineRepository;
  playerRef: RefObject<PlayerRef | null>;
  playerContainerRef: RefObject<HTMLElement | null>;
  fps: number;
  onCodeUpdated: () => void;
}

export function ChatPanel({
  job,
  repository,
  playerRef,
  playerContainerRef,
  fps,
  onCodeUpdated,
}: ChatPanelProps) {
  const { messages, sendMessage, isLoading, isFetchingHistory } = useTweakChat({
    repository,
    jobId: job.id,
    playerRef,
    playerContainerRef,
    fps,
    onCodeUpdated,
  });

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages and initial load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Scroll to bottom on initial history load
  useEffect(() => {
    if (!isFetchingHistory && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [isFetchingHistory, messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue("");
    await sendMessage(text);
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable Message List — takes all available space */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-3 p-3"
      >
        {isFetchingHistory && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-on-surface-variant" />
          </div>
        )}

        {!isFetchingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-on-surface-variant">
              Describe a tweak to your animation
            </p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              e.g. &quot;Make the title text larger&quot; or &quot;Speed up the
              intro&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isError =
            msg.role === "assistant" && msg.content.startsWith("Error:");

          return (
            <div
              key={msg.id}
              className={cn(
                "flex",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  isUser
                    ? "gradient-primary text-primary-foreground"
                    : isError
                      ? "bg-stage-failed/20 text-stage-failed"
                      : "bg-surface-container-highest text-on-surface",
                )}
              >
                <p className="whitespace-pre-wrap wrap-break-word">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}

        {/* Loading indicator for pending assistant response */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-surface-container-highest px-3 py-2">
              <Loader2 className="size-3.5 animate-spin text-on-surface-variant" />
              <span className="text-sm text-on-surface-variant">
                Thinking…
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2 px-3 pb-3 pt-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a tweak…"
          disabled={isLoading}
          className={cn(
            "h-9 flex-1 min-w-0 rounded-xl bg-surface-container-highest px-3 py-1 text-sm text-on-surface",
            "placeholder:text-on-surface-variant outline-none transition-all",
            "focus-visible:shadow-[0_0_0_4px_rgba(167,165,255,0.2)]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
        <Button
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={handleSend}
          disabled={isLoading || !inputValue.trim()}
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
