"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  History,
  RefreshCw,
  ArrowRight,
  Clock,
  BarChart3,
  Gauge,
} from "lucide-react";
import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import { FORMAT_WORD_RANGES } from "@video-ai/shared";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

interface ScriptReviewEditorProps {
  script: string;
  format: VideoFormat;
  onApprove: (editedScript?: string, scenes?: SceneBoundary[]) => void;
  onRegenerate: () => void;
  isLoading?: boolean;
  topic?: string;
  scenes?: SceneBoundary[];
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Rough estimate: ~150 words per minute for narration */
function estimateDuration(wordCount: number): string {
  const totalSeconds = Math.round((wordCount / 150) * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface SceneBlock {
  heading: string;
  body: string;
  tags: string[];
  /** Character offset of body start within the full script */
  bodyStart: number;
  /** Character offset of body end within the full script */
  bodyEnd: number;
}

/**
 * Parse a script into scene blocks with character offsets so we can map
 * edits back to the full script string.
 */
function parseScenes(text: string): SceneBlock[] {
  const lines = text.split("\n");
  const scenes: SceneBlock[] = [];
  let current: SceneBlock | null = null;
  let offset = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const lineStart = offset;
    offset += line.length + (li < lines.length - 1 ? 1 : 0); // +1 for \n

    const headingMatch = line.match(
      /^(?:scene\s*\d+|#{1,3}\s+scene\s*\d+)[:\s•\-–—]*(.*)/i,
    );
    if (headingMatch) {
      if (current) scenes.push(current);
      current = {
        heading: line.trim().replace(/^#+\s*/, ""),
        body: "",
        tags: [],
        bodyStart: offset, // body starts after this heading line
        bodyEnd: offset,
      };
      continue;
    }

    const tagMatch = line.match(/^\[([^\]]+)\]$/);
    if (tagMatch && current) {
      current.tags.push(tagMatch[1]!);
      continue;
    }

    if (current) {
      if (!current.body) {
        current.bodyStart = lineStart;
      }
      current.body += (current.body ? "\n" : "") + line;
      current.bodyEnd = lineStart + line.length;
    } else {
      current = {
        heading: "",
        body: line,
        tags: [],
        bodyStart: lineStart,
        bodyEnd: lineStart + line.length,
      };
    }
  }
  if (current) scenes.push(current);

  // If single block with no heading, split by double-newline into numbered scenes
  if (scenes.length === 1 && !scenes[0]!.heading) {
    const fullBody = scenes[0]!.body;
    const parts: SceneBlock[] = [];
    let partIndex = 0;
    const regex = /\n\s*\n/g;
    let match: RegExpExecArray | null;
    let lastEnd = 0;

    while ((match = regex.exec(fullBody)) !== null) {
      const chunk = fullBody.slice(lastEnd, match.index).trim();
      if (chunk) {
        parts.push({
          heading: `Scene ${String(partIndex + 1).padStart(2, "0")}`,
          body: chunk,
          tags: [],
          bodyStart: scenes[0]!.bodyStart + lastEnd,
          bodyEnd: scenes[0]!.bodyStart + match.index,
        });
        partIndex++;
      }
      lastEnd = match.index + match[0].length;
    }
    const remaining = fullBody.slice(lastEnd).trim();
    if (remaining) {
      parts.push({
        heading: `Scene ${String(partIndex + 1).padStart(2, "0")}`,
        body: remaining,
        tags: [],
        bodyStart: scenes[0]!.bodyStart + lastEnd,
        bodyEnd: scenes[0]!.bodyStart + fullBody.length,
      });
    }
    if (parts.length > 1) return parts;
  }

  return scenes;
}

function getToneLabel(wordCount: number): string {
  if (wordCount < 80) return "Concise";
  if (wordCount < 200) return "Educational";
  return "In-Depth";
}

function getComplexityLabel(wordCount: number): string {
  if (wordCount < 80) return "Low";
  if (wordCount < 200) return "Medium";
  return "High";
}

/* ─── Typing Indicator ─── */
function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Generating script content"
      className="flex items-center gap-1.5 py-2"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:300ms]" />
      <span className="ml-2 text-xs font-medium text-primary/60 animate-pulse">
        Generating…
      </span>
    </div>
  );
}

/* ─── Inline-editable Scene Block ─── */
function EditableSceneBlock({
  scene,
  index,
  disabled,
  onChange,
}: {
  scene: SceneBlock;
  index: number;
  disabled: boolean;
  onChange: (newBody: string) => void;
}) {
  const heading =
    scene.heading || `Scene ${String(index + 1).padStart(2, "0")}`;
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [scene.body, resize]);

  return (
    <div className="group relative">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary/60">
        {heading}
      </h3>
      <textarea
        ref={ref}
        value={scene.body.trim()}
        onChange={(e) => {
          onChange(e.target.value);
          resize();
        }}
        disabled={disabled}
        rows={1}
        className="w-full resize-none border-none bg-transparent text-lg font-medium leading-relaxed text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-0"
        aria-label={`Edit ${heading}`}
      />
      {scene.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {scene.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-secondary/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-secondary/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Density Bar ─── */
function DensityBar({
  label,
  value,
  maxValue,
  duration,
}: {
  label: string;
  value: number;
  maxValue: number;
  duration: string;
}) {
  const pct = Math.min(100, Math.round((value / maxValue) * 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-bold text-on-surface-variant/80">
        <span>{label}</span>
        <span>{duration}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%`, opacity: 0.4 + (pct / 100) * 0.6 }}
        />
      </div>
    </div>
  );
}

function MetricItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="group cursor-default">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="text-xl font-bold tracking-tight text-on-surface">
        {value}
      </p>
    </div>
  );
}

/* ─── Insights Sidebar (no suggestion card) ─── */
function InsightsSidebar({
  wordCount,
  scenes,
  format,
}: {
  wordCount: number;
  scenes: SceneBlock[];
  format: VideoFormat;
}) {
  const duration = estimateDuration(wordCount);
  const tone = getToneLabel(wordCount);
  const complexity = getComplexityLabel(wordCount);
  const range = FORMAT_WORD_RANGES[format];

  const totalWords = wordCount || 1;
  const sceneDensity = scenes.map((scene, i) => {
    const words = countWords(scene.body);
    const dur = estimateDuration(words);
    return {
      label: scene.heading || `Scene ${i + 1}`,
      words,
      duration: dur,
    };
  });

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-8 border-l border-outline-variant bg-surface-container-low p-8">
      <div className="space-y-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">
          Insights
        </h2>

        <div className="space-y-4">
          <MetricItem icon={Clock} label="Duration" value={duration} />
          <MetricItem icon={BarChart3} label="Tone" value={tone} />
          <MetricItem icon={Gauge} label="Complexity" value={complexity} />
          <div className="group cursor-default">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
              Word Count
            </p>
            <p
              className={cn(
                "text-xl font-bold tracking-tight",
                wordCount < range.min || wordCount > range.max
                  ? "text-destructive"
                  : "text-on-surface",
              )}
            >
              {wordCount}{" "}
              <span className="text-sm font-normal text-on-surface-variant">
                / {range.min}–{range.max}
              </span>
            </p>
          </div>
        </div>

        {sceneDensity.length > 1 && (
          <div className="space-y-4 pt-8">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">
              Density
            </h3>
            <div className="space-y-4">
              {sceneDensity.map((s) => (
                <DensityBar
                  key={s.label}
                  label={
                    s.label
                      .replace(/^Scene\s*\d+\s*[:\-–—•]\s*/i, "")
                      .trim() || s.label
                  }
                  value={s.words}
                  maxValue={totalWords}
                  duration={s.duration}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */
export function ScriptReviewEditor({
  script,
  format,
  onApprove,
  onRegenerate,
  isLoading = false,
  topic,
  scenes: apiScenes,
}: ScriptReviewEditorProps) {
  const [editedScript, setEditedScript] = useState(script);
  /** Track edited scene bodies when using API scenes */
  const [editedSceneBodies, setEditedSceneBodies] = useState<Map<number, string>>(new Map());

  // Sync editedScript with the script prop when it changes (e.g. during streaming).
  // useState only captures the initial value, so without this effect the editor
  // and InsightsSidebar would not reflect new chunks arriving via props.
  useEffect(() => {
    setEditedScript(script);
    setEditedSceneBodies(new Map());
  }, [script]);

  const wordCount = useMemo(() => countWords(editedScript), [editedScript]);
  const scenes = useMemo(() => {
    if (apiScenes && apiScenes.length > 0) {
      return apiScenes.map((s) => ({
        heading: s.name,
        body: s.text,
        tags: [s.type],
        bodyStart: 0,
        bodyEnd: 0,
      }));
    }
    return parseScenes(editedScript);
  }, [apiScenes, editedScript]);
  const range = FORMAT_WORD_RANGES[format];
  const isUnderMinimum = wordCount < 10;
  const isEdited = editedScript !== script;

  /** Replace a single scene's body text within the full script string */
  const handleSceneChange = useCallback(
    (sceneIndex: number, newBody: string) => {
      if (apiScenes && apiScenes.length > 0) {
        setEditedSceneBodies((prev) => {
          const next = new Map(prev);
          next.set(sceneIndex, newBody);
          return next;
        });
        // Reconstruct the full script from all scene bodies
        setEditedScript(() => {
          const parts = apiScenes.map((s, i) =>
            editedSceneBodies.has(i) && i !== sceneIndex
              ? editedSceneBodies.get(i)!
              : i === sceneIndex
                ? newBody
                : s.text,
          );
          return parts.join("\n\n");
        });
      } else {
        setEditedScript((prev) => {
          const parsed = parseScenes(prev);
          const scene = parsed[sceneIndex];
          if (!scene) return prev;
          return (
            prev.slice(0, scene.bodyStart) +
            newBody +
            prev.slice(scene.bodyEnd)
          );
        });
      }
    },
    [apiScenes, editedSceneBodies],
  );

  const handleApprove = useCallback(() => {
    const scriptToSend = isEdited ? editedScript : undefined;
    if (apiScenes && apiScenes.length > 0) {
      const reconstructedScenes = apiScenes.map((s, i) => ({
        ...s,
        text: editedSceneBodies.has(i) ? editedSceneBodies.get(i)! : s.text,
      }));
      onApprove(scriptToSend, reconstructedScenes);
    } else {
      onApprove(scriptToSend);
    }
  }, [onApprove, isEdited, editedScript, apiScenes, editedSceneBodies]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-secondary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-secondary">
              {format}
            </span>
            {isEdited && (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                Edited
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface">
            {topic || "Script Review"}
          </h1>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            disabled={isLoading}
            onClick={() => setEditedScript(script)}
          >
            <History className="size-3.5" />
            Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 bg-primary/10 text-primary hover:bg-primary/20"
            disabled={isLoading}
            onClick={onRegenerate}
          >
            <RefreshCw className="size-3.5" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Editor + Sidebar */}
      <div className="flex flex-1 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-ambient-lg">
        {/* Editor Canvas — inline editable */}
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto bg-surface-container-low">
            <div className="mx-auto max-w-2xl space-y-10 p-16">
              {scenes.map((scene, i) => (
                <EditableSceneBlock
                  key={i}
                  scene={scene}
                  index={i}
                  disabled={isLoading}
                  onChange={(newBody) => handleSceneChange(i, newBody)}
                />
              ))}
              {isLoading && <TypingIndicator />}
            </div>
          </div>

          {/* Word count status bar — pinned below the scroll area */}
          <div className="border-t border-outline-variant bg-surface-container-high/30 px-8 py-3">
            <div className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  "text-on-surface-variant",
                  !isLoading && isUnderMinimum && "text-destructive",
                )}
              >
                {wordCount} words
              </span>
              <span className="text-on-surface-variant">
                {range.min}–{range.max} recommended for {format}
              </span>
            </div>
            {!isLoading && isUnderMinimum && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                Script must contain at least 10 words
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-4 border-t border-outline-variant bg-surface-container-high/50 px-8 py-5">
            <Button
              variant="ghost"
              disabled={isLoading}
              onClick={onRegenerate}
            >
              Draft
            </Button>
            <Button
              disabled={isLoading || isUnderMinimum}
              onClick={handleApprove}
              className="gap-2 shadow-lg shadow-primary/10"
            >
              Approve Script
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Insights Sidebar */}
        <InsightsSidebar
          wordCount={wordCount}
          scenes={scenes}
          format={format}
        />
      </div>
    </div>
  );
}
