"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  Volume2,
  Square,
  Loader2,
} from "lucide-react";
import type {
  VideoFormat,
  SceneBoundary,
  VoiceEntry,
  VoiceSettings,
  PipelineJobDto,
} from "@video-ai/shared";
import { FORMAT_WORD_RANGES, DEFAULT_VOICE_SETTINGS } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { VoiceSelector } from "./voice-selector";
import { VoiceSettingsControls } from "./voice-settings-controls";
import { ScriptChatPanel } from "./script-chat-panel";
import { useVoiceSettingsPreview } from "../hooks/use-voice-settings-preview";

interface ScriptReviewEditorProps {
  script: string;
  format: VideoFormat;
  onApprove: (
    editedScript?: string,
    scenes?: SceneBoundary[],
    voiceId?: string,
    voiceSettings?: VoiceSettings,
  ) => void;
  onRegenerate: () => void;
  onBack?: () => void;
  isLoading?: boolean;
  statusMessage?: string | null;
  topic?: string;
  scenes?: SceneBoundary[];
  /** Voice data for the compact voice panel */
  voices?: VoiceEntry[];
  voicesLoading?: boolean;
  initialVoiceId?: string;
  initialVoiceSettings?: VoiceSettings;
  /** Job ID needed for the script chat panel */
  jobId?: string;
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
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary/50">
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
        className="w-full resize-none border-none bg-transparent text-lg font-medium leading-relaxed text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-0"
        aria-label={`Edit ${heading}`}
      />
      {scene.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {scene.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-secondary/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/40"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
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
  onVoiceSelect,
}: {
  voices: VoiceEntry[];
  voicesLoading: boolean;
  voiceId: string;
  voiceSettings: VoiceSettings;
  onVoiceChange: (id: string) => void;
  onSettingsChange: (settings: VoiceSettings) => void;
  onVoiceSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
        Narration
      </h2>

      {/* Voice selector — constrained height */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
          Voice
        </label>
        <div>
          <VoiceSelector
            voices={voices}
            selectedVoiceId={voiceId}
            onSelect={(id) => { onVoiceChange(id); onVoiceSelect(id); }}
            isLoading={voicesLoading}
          />
        </div>
      </div>

      {/* Voice settings — compact mode */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
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

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */
export function ScriptReviewEditor({
  script,
  format,
  onApprove,
  onRegenerate,
  onBack,
  isLoading = false,
  statusMessage,
  topic,
  scenes: apiScenes,
  voices = [],
  voicesLoading = false,
  initialVoiceId,
  initialVoiceSettings,
  jobId,
}: ScriptReviewEditorProps) {
  const [editedScript, setEditedScript] = useState(script);
  /** Track edited scene bodies when using API scenes */
  const [editedSceneBodies, setEditedSceneBodies] = useState<
    Map<number, string>
  >(new Map());
  /** When the chat tweaker returns updated scenes, store them here so the
   *  scenes memo uses them instead of the stale apiScenes prop. */
  const [chatOverrideScenes, setChatOverrideScenes] = useState<
    SceneBoundary[] | null
  >(null);
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
      requestPreview({
        voiceId: voiceId || undefined,
        voiceSettings,
        text: previewText,
      });
    }
  }, [
    previewPlaying,
    stopPlayback,
    requestPreview,
    voiceId,
    voiceSettings,
    previewText,
  ]);

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
    setChatOverrideScenes(null);
  }, [script]);

  const scenes = useMemo(() => {
    // After a chat tweak, use the rebuilt scenes from the backend
    if (chatOverrideScenes !== null && chatOverrideScenes.length > 0) {
      return chatOverrideScenes.map((s, i) => ({
        heading: s.name,
        body: editedSceneBodies.has(i) ? editedSceneBodies.get(i)! : s.text,
        tags: [s.type],
        bodyStart: 0,
        bodyEnd: 0,
      }));
    }
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
  }, [apiScenes, editedSceneBodies, editedScript, chatOverrideScenes]);
  const wordCount = useMemo(() => {
    if (chatOverrideScenes !== null && chatOverrideScenes.length > 0) {
      return scenes.reduce((sum, s) => sum + countWords(s.body), 0);
    }
    if (apiScenes && apiScenes.length > 0) {
      return scenes.reduce((sum, s) => sum + countWords(s.body), 0);
    }
    return countWords(editedScript);
  }, [apiScenes, scenes, editedScript, chatOverrideScenes]);
  const range = FORMAT_WORD_RANGES[format];
  const isUnderMinimum = wordCount < 10;
  const isEdited = editedScript !== script;

  /** Replace a single scene's body text within the full script string */
  const handleSceneChange = useCallback(
    (sceneIndex: number, newBody: string) => {
      // Clear chat override since the user is now manually editing
      setChatOverrideScenes(null);

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
            prev.slice(0, scene.bodyStart) + newBody + prev.slice(scene.bodyEnd)
          );
        });
      }
    },
    [apiScenes],
  );

  const handleApprove = useCallback(() => {
    flushSync(() => setIsApproving(true));
    const scriptToSend =
      isEdited && editedScript.trim() ? editedScript : undefined;
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
              text: editedSceneBodies.has(i)
                ? editedSceneBodies.get(i)!
                : s.text,
            }))
            .filter((s) => s.text.trim().length > 0)
        : undefined;
      onApprove(
        scriptToSend,
        reconstructedScenes,
        voiceId || undefined,
        voiceSettings,
      );
    } else {
      onApprove(scriptToSend, undefined, voiceId || undefined, voiceSettings);
    }
  }, [
    onApprove,
    isEdited,
    editedScript,
    apiScenes,
    editedSceneBodies,
    voiceId,
    voiceSettings,
  ]);

  /** Called by ScriptChatPanel when the AI tweaker returns an updated script */
  const handleScriptUpdated = useCallback(
    (newScript: string, newScenes: SceneBoundary[]) => {
      setEditedScript(newScript);
      setEditedSceneBodies(new Map());
      setChatOverrideScenes(newScenes);
    },
    [],
  );

  /** Minimal job object for ScriptChatPanel (only job.id is used by the hook) */
  const chatJob = useMemo<PipelineJobDto | null>(() => {
    if (!jobId) return null;
    return {
      id: jobId,
      topic: topic ?? "",
      format,
      themeId: "",
      status: "awaiting_script_review" as const,
      stage: "script_review" as const,
      progressPercent: 0,
      createdAt: "",
      updatedAt: "",
    };
  }, [jobId, topic, format]);

  const duration = estimateDuration(wordCount);
  const tone = getToneLabel(wordCount);

  const [activeTab, setActiveTab] = useState<"chat" | "script" | "narration">("script");
  const [isApproving, setIsApproving] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-white/50 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="size-6" />
            </button>
          )}
          <h1 className="text-xl sm:text-3xl font-light tracking-tight text-white truncate">
            {topic || "Script Review"}
          </h1>
          {isEdited && (
            <span className="hidden sm:inline rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary shrink-0">
              Edited
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" disabled={isLoading} onClick={onRegenerate} className="hidden sm:flex">
            Draft
          </Button>
          <Button
            disabled={isLoading || isApproving || isUnderMinimum}
            onClick={handleApprove}
            className="gap-2 shadow-lg shadow-primary/10 text-sm px-3"
          >
            {isApproving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Approve
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex lg:hidden mb-3 rounded-xl bg-white/[0.04] p-1 gap-1">
        {(["chat", "script", "narration"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-all",
              activeTab === tab
                ? "bg-white/[0.1] text-white"
                : "text-white/40 hover:text-white/60",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Layout: stacked on mobile, 3-col on desktop */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Chat Panel */}
        <div className={cn(
          "flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl",
          "lg:flex lg:w-1/4 lg:shrink-0",
          activeTab === "chat" ? "flex flex-1" : "hidden lg:flex",
        )}>
          <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
              Script Chat
            </span>
          </div>
          {chatJob ? (
            <ScriptChatPanel
              job={chatJob}
              repository={pipelineRepository}
              onScriptUpdated={handleScriptUpdated}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="text-sm text-white/40">
                Chat is available after the script is generated
              </p>
            </div>
          )}
        </div>

        {/* Script Editor */}
        <div className={cn(
          "flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl",
          "lg:flex lg:w-1/2",
          activeTab === "script" ? "flex flex-1" : "hidden lg:flex",
        )}>
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                Script
              </span>
              <div className="flex items-center gap-2 text-[11px] text-white/30">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {duration}
                </span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">{tone}</span>
                <span>·</span>
                <span
                  className={cn(
                    wordCount < range.min || wordCount > range.max
                      ? "text-destructive"
                      : "",
                  )}
                >
                  {wordCount} words
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {previewError && (
                <span className="hidden sm:inline text-[10px] text-destructive">
                  {previewError}
                </span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={(previewDisabled && !previewPlaying) || !previewText}
                onClick={handlePreviewClick}
                className="gap-1.5 text-xs h-7 px-3"
                aria-label={
                  previewPlaying ? "Stop preview"
                    : previewLoading ? "Generating preview"
                    : cooldownRemaining > 0 ? `Wait ${cooldownRemaining} seconds`
                    : "Preview narration"
                }
              >
                {previewLoading && <><Loader2 className="size-3 animate-spin" /><span>Generating…</span></>}
                {previewPlaying && <><Square className="size-3" /><span>Stop</span></>}
                {!previewLoading && !previewPlaying && cooldownRemaining > 0 && <span>Wait {cooldownRemaining}s</span>}
                {!previewLoading && !previewPlaying && cooldownRemaining === 0 && <><Volume2 className="size-3" /><span>Preview</span></>}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-10 px-4 sm:px-10 py-6 sm:py-10">
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

          <div className="flex items-center border-t border-white/[0.06] bg-white/[0.02] px-4 sm:px-8 py-3">
            <span
              className={cn(
                "text-xs text-white/30",
                !isLoading && isUnderMinimum && "text-destructive",
              )}
            >
              {range.min}–{range.max} recommended for {format}
              {!isLoading && isUnderMinimum && " · Script must contain at least 10 words"}
            </span>
          </div>
        </div>

        {/* Narration Panel */}
        <div className={cn(
          "overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl",
          "lg:block lg:w-1/4 lg:shrink-0",
          activeTab === "narration" ? "block flex-1" : "hidden lg:block",
        )}>
          <NarrationPanel
            voices={voices}
            voicesLoading={voicesLoading}
            voiceId={voiceId}
            voiceSettings={voiceSettings}
            onVoiceChange={setVoiceId}
            onVoiceSelect={(id) => requestPreview({ voiceId: id, voiceSettings, text: previewText })}
            onSettingsChange={setVoiceSettings}
          />
        </div>
      </div>
    </div>
  );
}
