"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export function DraftHero() {
  const router = useRouter();
  const [topic, setTopic] = useState("");

  const handleDraft = useCallback(() => {
    if (!topic.trim()) return;
    const params = new URLSearchParams({ topic: topic.trim() });
    router.push(`/create?${params.toString()}`);
  }, [topic, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleDraft();
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

      <div className="mt-8 flex items-center rounded-2xl border border-outline-variant bg-surface-variant/40 p-2 shadow-ambient-lg backdrop-blur-xl transition-all focus-within:border-primary/40">
        <div className="flex-1 px-4">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border-none bg-transparent p-2 text-lg text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-0"
            placeholder="e.g. The Quantum Physics of Black Holes"
          />
        </div>
        <Button
          onClick={handleDraft}
          disabled={!topic.trim()}
          className="gap-2 rounded-xl px-6 py-3"
          size="lg"
        >
          Draft
          <Sparkles className="size-4" />
        </Button>
      </div>
    </section>
  );
}
