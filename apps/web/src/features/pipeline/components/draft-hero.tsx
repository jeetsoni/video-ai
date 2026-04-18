"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Smartphone, Monitor, ChevronDown, Check, Palette } from "lucide-react";
import type { VideoFormat, AnimationTheme } from "@video-ai/shared";
import { ANIMATION_THEMES, DEFAULT_THEME_ID } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

type AspectOption = { format: VideoFormat; label: string; ratio: string; icon: typeof Smartphone };

const ASPECT_OPTIONS: AspectOption[] = [
  { format: "reel", label: "Vertical", ratio: "9:16", icon: Smartphone },
  { format: "longform", label: "Horizontal", ratio: "16:9", icon: Monitor },
];

function ThemeSwatches({ theme }: { theme: AnimationTheme }) {
  const colors = [theme.background, theme.accents.techCode, theme.accents.violet, theme.accents.revelation];
  return (
    <div className="flex gap-1">
      {colors.map((c, i) => (
        <span key={i} className="size-3 rounded-full" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function DraftHero() {
  const router = useRouter();
  const { pipelineRepository } = useAppDependencies();

  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<VideoFormat>("reel");
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [themeOpen, setThemeOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 8 * 28;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTopic(e.target.value);
      autoResize();
    },
    [autoResize],
  );

  const selectedTheme = ANIMATION_THEMES.find((t) => t.id === themeId) ?? ANIMATION_THEMES[0]!;

  const handleDraft = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await pipelineRepository.createJob({ topic: trimmed, format, themeId });
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
    <section className="max-w-3xl space-y-6">
      <h1 className="text-4xl font-black tracking-tight text-on-surface">
        Director&apos;s <span className="text-primary-dim">Draft</span>
      </h1>
      <p className="text-base leading-relaxed text-on-surface-variant">
        Enter an educational topic to generate a professional cinematic video using AI.
      </p>

      <div className="mt-8 space-y-3">
        {/* Topic input bar */}
        <div className="flex items-end rounded-2xl border border-outline-variant bg-surface-variant/40 p-2 shadow-ambient-lg backdrop-blur-xl transition-all focus-within:border-primary/40">
          <div className="flex-1 px-4">
            <textarea
              ref={textareaRef}
              value={topic}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full resize-none overflow-hidden border-none bg-transparent p-2 text-lg text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-0"
              placeholder="e.g. The Quantum Physics of Black Holes"
              disabled={isSubmitting}
            />
          </div>
          <Button
            onClick={handleDraft}
            disabled={!topic.trim() || isSubmitting}
            className="gap-2 rounded-xl px-6 py-3"
            size="lg"
          >
            {isSubmitting ? "Creating…" : "Draft"}
            <Sparkles className="size-4" />
          </Button>
        </div>

        {/* Options row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Format toggle pills */}
          <div className="flex items-center gap-1 rounded-xl bg-surface-container-high p-1">
            {ASPECT_OPTIONS.map((opt) => {
              const isActive = format === opt.format;
              return (
                <button
                  key={opt.format}
                  type="button"
                  onClick={() => setFormat(opt.format)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  <opt.icon className="size-3.5" />
                  <span>{opt.ratio}</span>
                </button>
              );
            })}
          </div>

          {/* Theme picker dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-all"
            >
              <Palette className="size-3.5" />
              <ThemeSwatches theme={selectedTheme} />
              <span className="hidden sm:inline">{selectedTheme.name}</span>
              <ChevronDown className={cn("size-3 transition-transform", themeOpen && "rotate-180")} />
            </button>

            {themeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-outline-variant bg-surface-container-highest p-2 shadow-ambient-lg backdrop-blur-xl">
                  {ANIMATION_THEMES.map((theme) => {
                    const isSelected = themeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => { setThemeId(theme.id); setThemeOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                          isSelected
                            ? "bg-primary/10 text-on-surface"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                        )}
                      >
                        <ThemeSwatches theme={theme} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{theme.name}</p>
                          <p className="text-[10px] text-on-surface-variant truncate">{theme.description}</p>
                        </div>
                        {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
