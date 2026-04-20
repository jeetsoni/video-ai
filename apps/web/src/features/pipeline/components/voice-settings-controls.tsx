"use client";

import { Volume2, Square, Loader2, Info } from "lucide-react";
import type { VoiceSettings } from "@video-ai/shared";
import { VOICE_SETTINGS_RANGES } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { useVoiceSettingsPreview } from "../hooks/use-voice-settings-preview";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

interface VoiceSettingsControlsProps {
  value: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
  voiceId?: string;
  showPreview?: boolean;
  /** Hides descriptions and tightens spacing for constrained layouts */
  compact?: boolean;
}

const SLIDER_CONFIG: {
  key: keyof VoiceSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "speed",
    label: "Speed",
    description:
      "Controls speaking pace. Below 1.0 slows down, above 1.0 speeds up.",
  },
  {
    key: "stability",
    label: "Stability",
    description:
      "Higher values produce more consistent delivery. Lower values add expressiveness.",
  },
  {
    key: "similarityBoost",
    label: "Similarity Boost",
    description:
      "Controls how closely the output matches the original voice.",
  },
  {
    key: "style",
    label: "Style",
    description:
      "Adds stylization and emotion. Higher values increase expressiveness.",
  },
];

export function VoiceSettingsControls({
  value,
  onChange,
  voiceId,
  showPreview = true,
  compact = false,
}: VoiceSettingsControlsProps) {
  const { pipelineRepository } = useAppDependencies();
  const {
    isLoading,
    isPlaying,
    error,
    cooldownRemaining,
    requestPreview,
    stopPlayback,
  } = useVoiceSettingsPreview(pipelineRepository);

  function handleChange(key: keyof VoiceSettings, newValue: number) {
    onChange({ ...value, [key]: newValue });
  }

  function handlePreviewClick() {
    if (isPlaying) {
      stopPlayback();
    } else {
      requestPreview({ voiceId, voiceSettings: value });
    }
  }

  const isDisabled = isLoading || cooldownRemaining > 0;

  return (
    <div className={compact ? "space-y-2.5" : "space-y-4"}>
      {SLIDER_CONFIG.map(({ key, label, description }) => {
        const range = VOICE_SETTINGS_RANGES[key];
        const currentValue = value[key];

        return (
          <div key={key} className={compact ? "space-y-0.5" : "space-y-1.5"}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <label
                  htmlFor={`voice-setting-${key}`}
                  className={cn(
                    "font-medium text-on-surface",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  {label}
                </label>
                {compact && (
                  <span className="group/tip relative">
                    <Info className="size-3 text-on-surface-variant/50 cursor-help" />
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 whitespace-normal rounded-lg bg-surface-container-highest px-3 py-2 text-[11px] leading-snug text-on-surface shadow-lg opacity-0 transition-opacity group-hover/tip:opacity-100 w-48"
                    >
                      {description}
                    </span>
                  </span>
                )}
              </span>
              <span className={cn(
                "tabular-nums text-on-surface-variant",
                compact ? "text-xs" : "text-sm",
              )}>
                {currentValue.toFixed(2)}
              </span>
            </div>
            <input
              id={`voice-setting-${key}`}
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={currentValue}
              onChange={(e) => handleChange(key, parseFloat(e.target.value))}
              aria-label={label}
              aria-valuemin={range.min}
              aria-valuemax={range.max}
              aria-valuenow={currentValue}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-container-high accent-primary"
            />
            {!compact && (
              <p className="text-xs text-on-surface-variant">{description}</p>
            )}
          </div>
        );
      })}

      {showPreview && (
        <div className="space-y-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDisabled && !isPlaying}
            onClick={handlePreviewClick}
            aria-label={
              isPlaying
                ? "Stop preview"
                : isLoading
                  ? "Generating preview"
                  : cooldownRemaining > 0
                    ? `Wait ${cooldownRemaining} seconds`
                    : "Preview voice"
            }
          >
            {isLoading && (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Generating...</span>
              </>
            )}
            {isPlaying && (
              <>
                <Square className="size-3.5" />
                <span>Stop</span>
              </>
            )}
            {!isLoading && !isPlaying && cooldownRemaining > 0 && (
              <span>Wait {cooldownRemaining}s</span>
            )}
            {!isLoading && !isPlaying && cooldownRemaining === 0 && (
              <>
                <Volume2 className="size-3.5" />
                <span>Preview</span>
              </>
            )}
          </Button>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
