"use client";

import { Clock, Mic } from "lucide-react";
import type { SceneBoundary, VideoFormat, VoiceSettings } from "@video-ai/shared";
import { FEATURED_VOICES } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";

interface SceneTimelineProps {
  scenes: SceneBoundary[];
  format: VideoFormat;
  themeId?: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings;
  createdAt: string;
  totalDuration?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SCENE_COLORS: Record<string, string> = {
  Hook: "bg-amber-500",
  Bridge: "bg-blue-500",
  Analogy: "bg-emerald-500",
  Architecture: "bg-violet-500",
  Spotlight: "bg-pink-500",
  Comparison: "bg-cyan-500",
  Power: "bg-orange-500",
  CTA: "bg-rose-500",
};

export function SceneTimeline({
  scenes,
  format,
  themeId,
  voiceId,
  createdAt,
  totalDuration,
}: SceneTimelineProps) {
  const voiceName = voiceId
    ? (FEATURED_VOICES.find((v) => v.voiceId === voiceId)?.name ?? "Custom")
    : null;

  const duration = totalDuration ?? (scenes.length > 0 ? scenes[scenes.length - 1]!.endTime : 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
          Scenes
        </span>
      </div>

      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {scenes.length === 0 && (
          <p className="text-sm text-white/30 text-center py-8">No scenes available</p>
        )}
        {scenes.map((scene) => (
          <div key={scene.id} className="rounded-lg px-3 py-2.5 hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("size-2 rounded-full shrink-0", SCENE_COLORS[scene.type] ?? "bg-white/30")} />
              <span className="text-xs font-medium text-white/70 truncate">{scene.name}</span>
              <span className="ml-auto text-[10px] tabular-nums text-white/30 shrink-0">
                {formatTime(scene.startTime)}–{formatTime(scene.endTime)}
              </span>
            </div>
            {scene.text && (
              <p className="text-sm text-white/40 pl-4">{scene.text}</p>
            )}
          </div>
        ))}
      </div>

      {/* Video metadata footer */}
      <div className="border-t border-white/[0.06] px-4 py-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5">
            <span className="text-xs text-white/50">Format</span>
            <span className="text-sm font-medium text-white/80 capitalize">{format}</span>
          </div>
          {duration > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5">
              <Clock className="size-3.5 text-white/50" />
              <span className="text-sm font-medium text-white/80">{formatTime(duration)}</span>
            </div>
          )}
          {themeId && (
            <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5">
              <span className="text-xs text-white/50">Theme</span>
              <span className="text-sm font-medium text-white/80 capitalize">{themeId}</span>
            </div>
          )}
          {voiceName && (
            <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5">
              <Mic className="size-3.5 text-white/50" />
              <span className="text-sm font-medium text-white/80">{voiceName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
