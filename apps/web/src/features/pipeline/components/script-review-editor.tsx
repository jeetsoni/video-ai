"use client";

import { useState, useMemo } from "react";
import type { VideoFormat } from "@video-ai/shared";
import { FORMAT_WORD_RANGES } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

interface ScriptReviewEditorProps {
  script: string;
  format: VideoFormat;
  onApprove: (editedScript?: string) => void;
  onRegenerate: () => void;
  isLoading?: boolean;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function ScriptReviewEditor({
  script,
  format,
  onApprove,
  onRegenerate,
  isLoading = false,
}: ScriptReviewEditorProps) {
  const [editedScript, setEditedScript] = useState(script);

  const wordCount = useMemo(() => countWords(editedScript), [editedScript]);
  const range = FORMAT_WORD_RANGES[format];
  const isUnderMinimum = wordCount < 10;
  const isOutsideRange = wordCount < range.min || wordCount > range.max;
  const hasWarning = isUnderMinimum || isOutsideRange;
  const isEdited = editedScript !== script;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="script-editor" className="text-sm font-medium">
        Script
      </label>
      <Textarea
        id="script-editor"
        value={editedScript}
        onChange={(e) => setEditedScript(e.target.value)}
        rows={10}
        disabled={isLoading}
        aria-describedby="word-count-info"
      />
      <div className="flex items-center justify-between text-sm" id="word-count-info">
        <span className={cn("text-muted-foreground", hasWarning && "text-destructive")}>
          {wordCount} words
        </span>
        <span className="text-muted-foreground">
          {range.min}–{range.max} words for {format}
        </span>
      </div>
      {hasWarning && (
        <p role="alert" className="text-sm text-destructive">
          {isUnderMinimum
            ? "Script must contain at least 10 words"
            : `Word count should be between ${range.min} and ${range.max} for ${format}`}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          onClick={() => onApprove(isEdited ? editedScript : undefined)}
          disabled={isLoading || isUnderMinimum}
        >
          Approve
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={isLoading}>
          Regenerate
        </Button>
      </div>
    </div>
  );
}
