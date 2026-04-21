"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  History,
  RefreshCw,
  ArrowRight,
  Clock,
  BarChart3,
  Gauge,
  Volume2,
  Square,
  Loader2,
} from "lucide-react";
import type { VideoFormat, SceneBoundary, VoiceEntry, VoiceSettings } from "@video-ai/shared";
import { FORMAT_WORD_RANGES, DEFAULT_VOICE_SETTINGS } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { VoiceSelector } from "./voice-selector";
import { VoiceSettingsControls } from "./voice-settings-controls";
import { useVoiceSettingsPreview } from "../hooks/use-voice-settings-preview";

interface ScriptReviewEditorProps {
  script: string;
  format: VideoFormat;
  onApprove: (editedScript?: string, scenes?: SceneBoundary[], voiceId?: string, voiceSettings?: VoiceSettings) => void;
  onRegenerate: () => void;
  isLoading?: boolean;
  statusMessage?: string | null;
  topic?: string;
  scenes?: SceneBoundary[];
  /** Voice data for the compact voice panel */
  voices?: VoiceEntry[];
  voicesLoading?: boolean;
  initialVoiceId?: string;
  initialVoiceSettings?: VoiceSettings;
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
function TypingIndicator({ message }: { message?: string | null }) {
  return (
    <div
      role="status"
      aria-label={message || "Generating script content"}
      className="flex items-center gap-1.5 py-2"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:300ms]" />
      <span className="ml-2 text-xs font-medium text-primary/60 animate-pulse">
        {message || "Generating…"}
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
        value={scene.body}
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
      <p className="text-lg font-bold tracking-tight text-on-surface">
        {value}
      </p>
    </div>
  );
}

/* ─── Narration Panel ─── */
function NarrationPanel({
  voices,
  voicesLoading,
  voiceId,
  voiceSettings,
  onVoiceChange,
  onSettingsChange,
}: {
  voices: VoiceEntry[];
  voicesLoading: boolean;
  voiceId: string;
  voiceSettings: VoiceSettings;
  onVoiceChange: (id: string) => void;
  onSettingsChange: (settings: VoiceSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">
        Narration
      </h2>

      {/* Voice selector — constrained height */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/80">
          Voice
        </label>
        <div className="**:[[role=listbox]]:max-h-36">
          <VoiceSelector
            voices={voices}
            selectedVoiceId={voiceId}
            onSelect={onVoiceChange}
            isLoading={voicesLoading}
          />
        </div>
      </div>

      {/* Voice settings — compact mode */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/80">
          Tuning
        </label>
        <VoiceSettingsControls
          value={voiceSettings}
          onChange={onSettingsChange}
          voiceId={voiceId}
          compact
          showPreview={false}
        />
      </div>
    </div>
  );
}

/* ─── Insights Panel ─── */
function InsightsPanel({
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
    <div className="space-y-5">
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
              "text-lg font-bold tracking-tight",
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
        <div className="space-y-3 pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">
            Density
          </h3>
          <div className="space-y-3">
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
  statusMessage,
  topic,
  scenes: apiScenes,
  voices = [],
  voicesLoading = false,
  initialVoiceId,
  initialVoiceSettings,
}: ScriptReviewEditorProps) {
  const [editedScript, setEditedScript] = useState(script);
  /** Track edited scene bodies when using API scenes */
  const [editedSceneBodies, setEditedSceneBodies] = useState<Map<number, string>>(new Map());
  const [voiceId, setVoiceId] = useState(initialVoiceId ?? "");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    initialVoiceSettings ?? DEFAULT_VOICE_SETTINGS,
  );

  // Voice preview hook — uses actual script text
  const { pipelineRepository } = useAppDependencies();
  const {
    isLoading: previewLoading,
    isPlaying: previewPlaying,
    error: previewError,
    cooldownRemaining,
    requestPreview,
    stopPlayback,
  } = useVoiceSettingsPreview(pipelineRepository);

  /** Extract the first sentence from the script for preview */
  const previewText = useMemo(() => {
    const text = editedScript.trim();
    if (!text) return undefined;
    // Match first sentence ending with . ! or ? (up to 300 chars)
    const match = text.match(/^.+?[.!?](?:\s|$)/s);
    const sentence = match ? match[0].trim() : text.slice(0, 150);
    return sentence.slice(0, 300);
  }, [editedScript]);

  const handlePreviewClick = useCallback(() => {
    if (previewPlaying) {
      stopPlayback();
    } else {
      requestPreview({ voiceId: voiceId || undefined, voiceSettings, text: previewText });
    }
  }, [previewPlaying, stopPlayback, requestPreview, voiceId, voiceSettings, previewText]);

  const previewDisabled = previewLoading || cooldownRemaining > 0;

  // Default to the first available voice when the initial voice
  // doesn't exist in the fetched voice list.
  useEffect(() => {
    if (voices.length > 0 && voiceId) {
      const ids = new Set(voices.map((v) => v.voiceId));
      if (!ids.has(voiceId)) {
        setVoiceId(voices[0]!.voiceId);
      }
    } else if (voices.length > 0 && !voiceId) {
      setVoiceId(voices[0]!.voiceId);
    }
  }, [voices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync editedScript with the script prop when it changes (e.g. during streaming).
  // useState only captures the initial value, so without this effect the editor
  // and InsightsSidebar would not reflect new chunks arriving via props.
  useEffect(() => {
    setEditedScript(script);
    setEditedSceneBodies(new Map());
  }, [script]);

  const scenes = useMemo(() => {
    if (apiScenes && apiScenes.length > 0) {
      return apiScenes.map((s, i) => ({
        heading: s.name,
        body: editedSceneBodies.has(i) ? editedSceneBodies.get(i)! : s.text,
        tags: [s.type],
        bodyStart: 0,
        bodyEnd: 0,
      }));
    }
    return parseScenes(editedScript);
  }, [apiScenes, editedSceneBodies, editedScript]);
  const wordCount = useMemo(() => {
    if (apiScenes && apiScenes.length > 0) {
      // Derive word count from the actual displayed scene bodies
      return scenes.reduce((sum, s) => sum + countWords(s.body), 0);
    }
    return countWords(editedScript);
  }, [apiScenes, scenes, editedScript]);
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
          // Also reconstruct the full script from the updated map
          const parts = apiScenes.map((s, i) =>
            i === sceneIndex ? newBody : next.has(i) ? next.get(i)! : s.text,
          );
          setEditedScript(parts.join("\n\n"));
          return next;
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
    [apiScenes],
  );

  const handleApprove = useCallback(() => {
    const scriptToSend = isEdited && editedScript.trim() ? editedScript : undefined;
    if (apiScenes && apiScenes.length > 0) {
      // Only send scenes if the user actually edited any scene body
      const hasEditedScenes = editedSceneBodies.size > 0;
      const reconstructedScenes = hasEditedScenes
        ? apiScenes
            .map((s, i) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              startTime: s.startTime,
              endTime: s.endTime,
              text: editedSceneBodies.has(i) ? editedSceneBodies.get(i)! : s.text,
            }))
            .filter((s) => s.text.trim().length > 0)
        : undefined;
      onApprove(scriptToSend, reconstructedScenes, voiceId || undefined, voiceSettings);
    } else {
      onApprove(scriptToSend, undefined, voiceId || undefined, voiceSettings);
    }
  }, [onApprove, isEdited, editedScript, apiScenes, editedSceneBodies, voiceId, voiceSettings]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
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

      {/* 3-column Layout: Editor | Narration | Insights */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: Script Editor (50%) */}
        <div className="flex w-1/2 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-ambient-lg">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high/30 px-6 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">
              Script
            </span>
            <div className="flex items-center gap-2">
              {previewError && (
                <span className="text-[10px] text-destructive">{previewError}</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={(previewDisabled && !previewPlaying) || !previewText}
                onClick={handlePreviewClick}
                className="gap-1.5 text-xs h-7 px-3"
                aria-label={
                  previewPlaying
                    ? "Stop preview"
                    : previewLoading
                      ? "Generating preview"
                      : cooldownRemaining > 0
                        ? `Wait ${cooldownRemaining} seconds`
                        : "Preview narration"
                }
              >
                {previewLoading && (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    <span>Generating…</span>
                  </>
                )}
                {previewPlaying && (
                  <>
                    <Square className="size-3" />
                    <span>Stop</span>
                  </>
                )}
                {!previewLoading && !previewPlaying && cooldownRemaining > 0 && (
                  <span>Wait {cooldownRemaining}s</span>
                )}
                {!previewLoading && !previewPlaying && cooldownRemaining === 0 && (
                  <>
                    <Volume2 className="size-3" />
                    <span>Preview</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-10 px-10 py-10">
              {scenes.map((scene, i) => (
                <EditableSceneBlock
                  key={i}
                  scene={scene}
                  index={i}
                  disabled={isLoading}
                  onChange={(newBody) => handleSceneChange(i, newBody)}
                />
              ))}
              {isLoading && <TypingIndicator message={statusMessage} />}
            </div>
          </div>

          {/* Word count status bar */}
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

        {/* Middle: Narration (25%) */}
        <div className="flex w-1/4 flex-col overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low p-5 shadow-ambient-lg">
          <NarrationPanel
            voices={voices}
            voicesLoading={voicesLoading}
            voiceId={voiceId}
            voiceSettings={voiceSettings}
            onVoiceChange={setVoiceId}
            onSettingsChange={setVoiceSettings}
          />
        </div>

        {/* Right: Insights (25%) */}
        <div className="flex w-1/4 flex-col overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-ambient-lg">
          <InsightsPanel
            wordCount={wordCount}
            scenes={scenes}
            format={format}
          />
        </div>
      </div>
    </div>
  );
}
