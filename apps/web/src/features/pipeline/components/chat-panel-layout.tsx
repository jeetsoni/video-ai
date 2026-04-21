"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelLayoutProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isFetchingHistory: boolean;
  placeholder?: string;
  emptyTitle?: string;
  emptyHint?: string;
  onSend: (text: string) => Promise<void>;
}

export function ChatPanelLayout({
  messages,
  isLoading,
  isFetchingHistory,
  placeholder = "Type a message…",
  emptyTitle = "Start a conversation",
  emptyHint,
  onSend,
}: ChatPanelLayoutProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isFetchingHistory && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [isFetchingHistory, messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue("");
    await onSend(text);
  }, [inputValue, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-3">
        {isFetchingHistory && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-on-surface-variant" />
          </div>
        )}

        {!isFetchingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-on-surface-variant">{emptyTitle}</p>
            {emptyHint && (
              <p className="text-xs text-on-surface-variant/60 mt-1">{emptyHint}</p>
            )}
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isError = msg.role === "assistant" && msg.content.startsWith("Error:");
          return (
            <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
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
                <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-surface-container-highest px-3 py-2">
              <Loader2 className="size-3.5 animate-spin text-on-surface-variant" />
              <span className="text-sm text-on-surface-variant">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3">
        <div className="flex items-end gap-2 rounded-2xl bg-white/[0.08] px-4 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)] focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.3),0_0_0_2px_rgba(167,165,255,0.3)] transition-all">
          <textarea
            rows={1}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 72) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 min-w-0 resize-none overflow-y-auto bg-transparent text-sm text-white placeholder:text-white/30 outline-none disabled:opacity-50"
            style={{ maxHeight: "72px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send message"
            className="shrink-0 rounded-lg bg-primary/80 p-1.5 text-white hover:bg-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
