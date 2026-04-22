"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown, Check, Palette } from "lucide-react";
import type { VideoFormat, AnimationTheme } from "@video-ai/shared";
import { ANIMATION_THEMES, DEFAULT_THEME_ID } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { cn } from "@/shared/lib/utils";

function ThemeSwatches({ theme }: { theme: AnimationTheme }) {
  return (
    <div className="flex gap-1">
      {[
        theme.background,
        theme.accents.techCode,
        theme.accents.violet,
        theme.accents.revelation,
      ].map((c, i) => (
        <span
          key={i}
          className="size-3 rounded-full"
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function DraftHero() {
  const router = useRouter();
  const { pipelineRepository } = useAppDependencies();

  const [topic, setTopic] = useState("");
  const [format] = useState<VideoFormat>("reel");
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [themeOpen, setThemeOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const themePickerRef = useRef<HTMLDivElement>(null);

  // Close theme dropdown on outside click
  useEffect(() => {
    if (!themeOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        themePickerRef.current &&
        !themePickerRef.current.contains(e.target as Node)
      ) {
        setThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [themeOpen]);

  const selectedTheme =
    ANIMATION_THEMES.find((t) => t.id === themeId) ?? ANIMATION_THEMES[0]!;

  const handleDraft = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await pipelineRepository.createJob({
        topic: trimmed,
        format,
        themeId,
      });
      router.push(`/jobs/${res.jobId}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [topic, format, themeId, isSubmitting, pipelineRepository, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleDraft();
      }
    },
    [handleDraft],
  );

  return (
    <section className="flex flex-col items-center text-center gap-6 sm:gap-10 w-full max-w-[820px] mx-auto mt-6 sm:mt-16">
      {/* Heading */}
      <div className="space-y-3">
        <h1 className="text-[36px] sm:text-[56px] md:text-[80px] font-light leading-[1.05] tracking-[-0.02em] text-white">
          Create videos at
          <br />
          the speed of AI
        </h1>
        <p className="text-base sm:text-lg text-white/60">
          Transform any topic into a cinematic AI-generated video
        </p>
      </div>

      {/* Input card — Stitch style */}
      <div className="w-full rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1 shadow-[0_8px_64px_rgba(100,94,251,0.12)] backdrop-blur-2xl">
        <div className="px-5 pt-4 pb-2">
          <textarea
            ref={textareaRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            className="w-full resize-none border-none bg-transparent text-base text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-0"
            placeholder="What topic should we turn into a video?"
            disabled={isSubmitting}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-4 pb-3">
          {/* Left — theme picker */}
          <div className="relative" ref={themePickerRef}>
            <button
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/[0.1] transition-all"
            >
              <Palette className="size-3.5" />
              <ThemeSwatches theme={selectedTheme} />
              <span className="hidden sm:inline">{selectedTheme.name}</span>
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  themeOpen && "rotate-180",
                )}
              />
            </button>

            {themeOpen && (
                <div className="absolute left-0 bottom-full z-50 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1a1a2e]/95 p-2 shadow-2xl backdrop-blur-2xl">
                  {ANIMATION_THEMES.map((theme) => {
                    const isSelected = themeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setThemeId(theme.id);
                          setThemeOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                          isSelected
                            ? "bg-white/[0.08] text-white"
                            : "text-white/60 hover:bg-white/[0.05] hover:text-white/80",
                        )}
                      >
                        <ThemeSwatches theme={theme} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {theme.name}
                          </p>
                          <p className="text-[10px] text-white/40 truncate">
                            {theme.description ?? theme.name}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="size-3.5 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
            )}
          </div>

          {/* Right — submit */}
          <button
            type="button"
            onClick={handleDraft}
            disabled={!topic.trim() || isSubmitting}
            className="flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/[0.14] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles className="size-4" />
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </section>
  );
}
