"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import type { VoiceEntry } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";

interface VoiceSelectorProps {
  voices: VoiceEntry[];
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  isLoading?: boolean;
}

function VoiceCard({
  voice,
  isSelected,
  onSelect,
}: {
  voice: VoiceEntry;
  isSelected: boolean;
  onSelect: () => void;
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
        <p className="text-sm font-medium text-on-surface truncate">{voice.name}</p>
        <p className="text-xs text-on-surface-variant truncate">{voice.description}</p>
      </div>
      {isSelected && <Check className="size-4 text-primary shrink-0" />}
    </div>
  );
}

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onSelect,
  isLoading = false,
}: VoiceSelectorProps) {
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-container-high animate-pulse" />
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
        className="max-h-96 overflow-y-auto space-y-1 rounded-xl"
      >
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-on-surface-variant">No voices found</p>
        )}
        {filtered.map((voice) => (
          <VoiceCard
            key={voice.voiceId}
            voice={voice}
            isSelected={selectedVoiceId === voice.voiceId}
            onSelect={() => onSelect(voice.voiceId)}
          />
        ))}
      </div>
    </div>
  );
}
