"use client";

import { Volume2, Square, Loader2 } from "lucide-react";
import type { VoiceSettings } from "@video-ai/shared";
import { VOICE_SETTINGS_RANGES } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { useVoiceSettingsPreview } from "../hooks/use-voice-settings-preview";
import { Button } from "@/shared/components/ui/button";

interface VoiceSettingsControlsProps {
  value: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
  voiceId?: string;
  showPreview?: boolean;
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
    <div className="space-y-4">
      {SLIDER_CONFIG.map(({ key, label, description }) => {
        const range = VOICE_SETTINGS_RANGES[key];
        const currentValue = value[key];

        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`voice-setting-${key}`}
                className="text-sm font-medium text-on-surface"
              >
                {label}
              </label>
              <span className="text-sm tabular-nums text-on-surface-variant">
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
            <p className="text-xs text-on-surface-variant">{description}</p>
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
