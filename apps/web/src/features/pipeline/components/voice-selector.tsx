"use client";

import { useState } from "react";
import { Play, Square, AlertCircle, Check, Search } from "lucide-react";
import type { VoiceEntry } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import { useVoicePreview } from "../hooks/use-voice-preview";

interface VoiceSelectorProps {
  voices: VoiceEntry[];
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  isLoading?: boolean;
}

function VoiceCard({
  voice,
  isSelected,
  isPlaying,
  hasError,
  onSelect,
  onPlay,
  onStop,
}: {
  voice: VoiceEntry;
  isSelected: boolean;
  isPlaying: boolean;
  hasError: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onStop: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-label={`${voice.name}: ${voice.description}`}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-3 cursor-pointer transition-all border-2",
        isSelected
          ? "bg-primary/10 border-primary/40"
          : "border-transparent hover:bg-surface-container-high",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface truncate">
          {voice.name}
        </p>
        <p className="text-xs text-on-surface-variant truncate">
          {voice.description}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasError && (
          <AlertCircle
            className="size-4 text-destructive"
            aria-label="Preview failed"
          />
        )}

        {voice.previewUrl && (
          <button
            type="button"
            aria-label={
              isPlaying
                ? `Stop ${voice.name} preview`
                : `Play ${voice.name} preview`
            }
            onClick={(e) => {
              e.stopPropagation();
              isPlaying ? onStop() : onPlay();
            }}
            className="flex items-center justify-center size-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest transition-colors"
          >
            {isPlaying ? (
              <Square className="size-3.5 text-on-surface" />
            ) : (
              <Play className="size-3.5 text-on-surface" />
            )}
          </button>
        )}

        {isSelected && <Check className="size-4 text-primary shrink-0" />}
      </div>
    </div>
  );
}

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onSelect,
  isLoading = false,
}: VoiceSelectorProps) {
  const { playingVoiceId, errorVoiceId, play, stop } = useVoicePreview();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl bg-surface-container-high animate-pulse"
          />
        ))}
      </div>
    );
  }

  const filtered = search.trim()
    ? voices.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.description.toLowerCase().includes(search.toLowerCase()),
      )
    : voices;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search voices…"
          className="w-full rounded-xl border border-outline-variant bg-surface-variant/40 py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/40 transition-colors"
        />
      </div>

      <div
        role="listbox"
        aria-label="Voice selector"
        className="max-h-64 overflow-y-auto space-y-1 rounded-xl"
      >
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-on-surface-variant">
            No voices found
          </p>
        )}
        {filtered.map((voice) => (
          <VoiceCard
            key={voice.voiceId}
            voice={voice}
            isSelected={selectedVoiceId === voice.voiceId}
            isPlaying={playingVoiceId === voice.voiceId}
            hasError={errorVoiceId === voice.voiceId}
            onSelect={() => onSelect(voice.voiceId)}
            onPlay={() => {
              if (voice.previewUrl) {
                play(voice.voiceId, voice.previewUrl);
              }
            }}
            onStop={stop}
          />
        ))}
      </div>
    </div>
  );
}
