"use client";

function ScriptIllustration() {
  return (
    <div className="flex-1 flex items-start justify-center pt-8 px-6 overflow-hidden">
      <div className="w-full max-w-[320px] space-y-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 space-y-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] text-white/40 font-mono">Generating script…</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-primary/60 font-mono w-6 shrink-0">01</span>
              <div className="h-2.5 rounded-full bg-white/[0.12] w-full" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-primary/60 font-mono w-6 shrink-0">02</span>
              <div className="h-2.5 rounded-full bg-white/[0.08] w-4/5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-primary/60 font-mono w-6 shrink-0">03</span>
              <div className="h-2.5 rounded-full bg-white/[0.06] w-3/5" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
          <p className="text-[11px] text-primary/80 font-mono">&quot;Explain quantum computing in 60 seconds&quot;</p>
        </div>
      </div>
    </div>
  );
}

function PreviewIllustration() {
  return (
    <div className="flex-1 flex items-start justify-center pt-8 px-6 overflow-hidden">
      <div className="w-full max-w-[340px] flex gap-3">
        <div className="flex-1 rounded-xl border border-white/[0.08] bg-black/40 aspect-[9/14] flex items-center justify-center">
          <div className="size-10 rounded-full bg-white/[0.08] flex items-center justify-center">
            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-white/60 ml-0.5" />
          </div>
        </div>
        <div className="w-[140px] shrink-0 space-y-2">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2.5 space-y-2">
            <div className="h-2 rounded bg-white/[0.1] w-full" />
            <div className="h-2 rounded bg-white/[0.06] w-3/4" />
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-2.5">
            <p className="text-[10px] text-primary/70">&quot;Make the intro more dramatic&quot;</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2.5">
            <div className="space-y-1.5">
              <div className="h-2 rounded bg-white/[0.08] w-full" />
              <div className="h-2 rounded bg-white/[0.06] w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportIllustration() {
  return (
    <div className="flex-1 flex items-start justify-center pt-8 px-6 overflow-hidden">
      <div className="w-full max-w-[280px] space-y-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden">
          <div className="bg-black/40 aspect-video flex items-center justify-center">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-12 rounded bg-white/[0.06] border border-white/[0.08]" />
              ))}
            </div>
          </div>
          <div className="p-3 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-2 rounded bg-white/[0.12] w-20" />
              <div className="text-[10px] text-white/30 font-mono">1080×1920 · MP4</div>
            </div>
            <div className="rounded-full bg-primary/20 px-3 py-1">
              <span className="text-[10px] text-primary font-medium">Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceIllustration() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
        <div className="relative flex flex-col items-center gap-4">
          <div className="flex items-end gap-[3px] h-16">
            {[0.3, 0.6, 1, 0.7, 0.4, 0.8, 1, 0.5, 0.9, 0.6, 0.3, 0.7, 0.5, 0.9, 0.4].map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-primary/60"
                style={{ height: `${h * 64}px`, opacity: 0.4 + h * 0.6 }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {["Aria", "Marcus", "Luna"].map((name) => (
              <div key={name} className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1">
                <span className="text-[10px] text-white/50">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeIllustration() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
      <div className="flex gap-4">
        {[
          { name: "Studio", colors: ["#645EFB", "#8B5CF6", "#06B6D4", "#0a0a1a"] },
          { name: "Neon", colors: ["#F43F5E", "#EC4899", "#8B5CF6", "#0f0a1a"] },
          { name: "Earth", colors: ["#D97706", "#059669", "#0284C7", "#0a1210"] },
        ].map((theme) => (
          <div key={theme.name} className="flex flex-col items-center gap-2">
            <div
              className="w-20 h-28 rounded-xl border border-white/[0.08] p-2 flex flex-col justify-between"
              style={{ background: `linear-gradient(135deg, ${theme.colors[3]}, ${theme.colors[0]}22)` }}
            >
              <div className="flex gap-1">
                {theme.colors.slice(0, 3).map((c, i) => (
                  <div key={i} className="size-3 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="space-y-1">
                <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: theme.colors[0], opacity: 0.5 }} />
                <div className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: theme.colors[1], opacity: 0.3 }} />
              </div>
            </div>
            <span className="text-[10px] text-white/40">{theme.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const features = [
  {
    title: "AI Script Generation",
    description: "Describe any topic and get a full video script with scene-by-scene breakdowns.",
    illustration: ScriptIllustration,
    span: "col-span-1",
  },
  {
    title: "Live Preview & Tweak",
    description: "Preview in real-time and refine with natural language — just chat to adjust.",
    illustration: PreviewIllustration,
    span: "col-span-1",
  },
  {
    title: "Export & Download",
    description: "Render cinematic MP4 videos ready for any platform. One click to download.",
    illustration: ExportIllustration,
    span: "col-span-1",
  },
  {
    title: "Natural Voiceovers",
    description: "Multiple AI voices with adjustable speed and pitch. Preview before you commit.",
    illustration: VoiceIllustration,
    span: "col-span-1 md:col-span-1",
  },
  {
    title: "Theme Customization",
    description: "Curated animation themes with unique palettes and motion styles for your brand.",
    illustration: ThemeIllustration,
    span: "col-span-1 md:col-span-2",
  },
] as const;

export function FeaturesGrid() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((f) => (
          <div
            key={f.title}
            className={`${f.span} group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] min-h-[420px] overflow-hidden transition-colors hover:border-white/[0.15]`}
          >
            <f.illustration />
            <div className="p-8 pt-6 mt-auto">
              <h3 className="text-[26px] font-light text-white">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/40">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
