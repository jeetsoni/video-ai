"use client";

import { useState } from "react";
import type { VideoFormat } from "@video-ai/shared";
import { DEFAULT_THEME_ID } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { FormatSelector } from "./format-selector";
import { ThemeSelector } from "./theme-selector";

const TOPIC_MIN = 3;
const TOPIC_MAX = 500;

interface PipelineWizardProps {
  onSubmit: (data: { topic: string; format: VideoFormat; themeId: string }) => void;
  isSubmitting?: boolean;
  initialTopic?: string;
}

export function PipelineWizard({ onSubmit, isSubmitting = false, initialTopic = "" }: PipelineWizardProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [format, setFormat] = useState<VideoFormat | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ topic?: string; format?: string }>({});

  function validate(): boolean {
    const next: { topic?: string; format?: string } = {};
    const trimmed = topic.trim();

    if (trimmed.length < TOPIC_MIN || trimmed.length > TOPIC_MAX) {
      next.topic = `Topic must be between ${TOPIC_MIN} and ${TOPIC_MAX} characters`;
    }

    if (!format) {
      next.format = "Please select a video format";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      topic: topic.trim(),
      format: format!,
      themeId: themeId ?? DEFAULT_THEME_ID,
    });
  }

  const charCount = topic.trim().length;
  const isTopicInvalid = charCount > 0 && (charCount < TOPIC_MIN || charCount > TOPIC_MAX);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <label htmlFor="topic" className="text-sm font-medium text-on-surface">
          Topic
        </label>
        <Textarea
          id="topic"
          placeholder="Describe the topic for your educational video..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={TOPIC_MAX}
          aria-invalid={!!errors.topic || isTopicInvalid}
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-between">
          {errors.topic ? (
            <p className="text-sm text-destructive">{errors.topic}</p>
          ) : (
            <span />
          )}
          <p className={`text-xs ${isTopicInvalid ? "text-destructive" : "text-on-surface-variant"}`}>
            {charCount}/{TOPIC_MAX}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">Video Format</label>
        <FormatSelector value={format} onChange={setFormat} />
        {errors.format && (
          <p className="text-sm text-destructive">{errors.format}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">Animation Theme</label>
        <ThemeSelector value={themeId} onChange={setThemeId} />
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg">
        {isSubmitting ? "Creating…" : "Create Video"}
      </Button>
    </form>
  );
}
