"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import {
  Download,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { FORMAT_RESOLUTIONS, type PipelineJobDto } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { PipelineRepository } from "../interfaces/pipeline-repository";
import { getStageDisplayInfo } from "../utils/stage-display-map";
import { useTweakChat } from "../hooks/use-tweak-chat";

const FORMAT_LABELS: Record<string, string> = {
  reel: "Reel",
  short: "Short",
  longform: "Longform",
};

export interface ChatPanelProps {
  job: PipelineJobDto;
  repository: PipelineRepository;
  playerRef: RefObject<PlayerRef | null>;
  playerContainerRef: RefObject<HTMLElement | null>;
  fps: number;
  onCodeUpdated: () => void;
  onExport?: () => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function ChatPanel({
  job,
  repository,
  playerRef,
  playerContainerRef,
  fps,
  onCodeUpdated,
  onExport,
  onRegenerate,
  isRegenerating,
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

  const stageInfo = getStageDisplayInfo(job.stage);
  const StageIcon = stageInfo.icon;
  const resolution =
    FORMAT_RESOLUTIONS[job.format as keyof typeof FORMAT_RESOLUTIONS];

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

  const stageColor =
    job.status === "failed"
      ? "stage-failed"
      : job.stage === "done"
        ? "stage-complete"
        : "stage-active";

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Compact Stage Indicator + Progress */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            `bg-${stageColor}/20`,
          )}
        >
          <StageIcon className={cn("size-3.5", `text-${stageColor}`)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-on-surface truncate">
            {job.status === "failed"
              ? `${stageInfo.label} — Failed`
              : stageInfo.label}
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-on-surface-variant">
          {job.progressPercent}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 rounded-full bg-surface-container-high"
        role="progressbar"
        aria-valuenow={job.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            job.status === "failed"
              ? "bg-stage-failed"
              : job.stage === "done"
                ? "bg-stage-complete"
                : "gradient-primary",
          )}
          style={{ width: `${job.progressPercent}%` }}
        />
      </div>

      {/* Compact Summary Card */}
      <div className="glass rounded-xl p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="label-caps text-[10px]">Format</p>
            <p className="text-xs text-on-surface">
              {FORMAT_LABELS[job.format] ?? job.format}
            </p>
          </div>
          <div>
            <p className="label-caps text-[10px]">Resolution</p>
            <p className="text-xs text-on-surface">
              {resolution.width}×{resolution.height}
            </p>
          </div>
          {job.themeId && (
            <div>
              <p className="label-caps text-[10px]">Theme</p>
              <p className="text-xs text-on-surface truncate">{job.themeId}</p>
            </div>
          )}
          <div>
            <p className="label-caps text-[10px]">Created</p>
            <p className="text-xs text-on-surface">
              {new Date(job.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Compact Action Buttons Row */}
      <div className="flex gap-2">
        {job.stage === "preview" && onExport && (
          <Button
            size="sm"
            className="flex-1 gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
            onClick={onExport}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        )}
        {job.stage === "rendering" && (
          <Button
            size="sm"
            className="flex-1 gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
            disabled
          >
            <Loader2 className="size-3.5 animate-spin" />
            Rendering…
          </Button>
        )}
        {job.stage === "done" && job.videoUrl && (
          <Button
            size="sm"
            className="flex-1 gap-1.5 gradient-primary rounded-lg text-primary-foreground font-semibold"
            onClick={async () => {
              try {
                const res = await fetch(job.videoUrl!);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${job.topic || "video"}.mp4`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch {
                window.open(job.videoUrl!, "_blank");
              }
            }}
          >
            <Download className="size-3.5" />
            Download
          </Button>
        )}
        {job.stage === "done" && onExport && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={onExport}
          >
            <RefreshCw className="size-3.5" />
            Re-render
          </Button>
        )}
        {(job.stage === "preview" || job.stage === "done") && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Regenerate
          </Button>
        )}
      </div>

      {/* Scrollable Message List */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-3 rounded-xl bg-surface-container-high/50 p-3"
      >
        {isFetchingHistory && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-on-surface-variant" />
          </div>
        )}

        {!isFetchingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-on-surface-variant">
              Describe a tweak to your animation
            </p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              e.g. &quot;Make the title text larger&quot;
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
                <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
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
      <div className="flex gap-2">
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
