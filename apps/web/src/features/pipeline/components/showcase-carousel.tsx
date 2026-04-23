"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";

function CarouselCard({
  job,
  muted,
  onToggleMute,
}: {
  job: PipelineJobDto;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    videoRef.current?.play().catch(() => {});
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    const v = videoRef.current;
    if (v) { v.pause(); v.load(); }
  }, []);

  return (
    <div
      className="shrink-0 w-[340px] rounded-2xl overflow-hidden bg-white/[0.03] border border-white/[0.08] cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-white/[0.15]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-[9/16] bg-black/40 flex items-center justify-center">
        {job.videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={job.videoUrl}
              className="size-full object-cover"
              muted={muted}
              loop
              playsInline
              poster={job.thumbnailUrl}
            />
            {!isHovered && !job.thumbnailUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="size-8 rounded-full bg-black/50 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[9px] border-l-white ml-0.5" />
                </div>
              </div>
            )}
            {isHovered && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
                className="absolute bottom-2 right-2 size-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
            )}
          </>
        ) : job.thumbnailUrl ? (
          <img src={job.thumbnailUrl} alt={job.topic} className="size-full object-cover" />
        ) : (
          <Film className="size-8 text-on-surface-variant/30" />
        )}
      </div>
      <div className="px-5 py-4">
        <p className="text-xs text-white/40">AI Video</p>
        <p className="text-sm font-medium text-white/80 line-clamp-1">{job.topic}</p>
      </div>
    </div>
  );
}

export function ShowcaseCarousel() {
  const { pipelineRepository } = useAppDependencies();
  const [jobs, setJobs] = useState<PipelineJobDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pipelineRepository.listShowcase(1, 20).then((res) => {
      setJobs(res.jobs);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [pipelineRepository]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || jobs.length === 0) return;

    let speed = 0.4;
    const tick = () => {
      if (!pausedRef.current && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += speed;
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth) {
          el.scrollLeft = 0;
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [jobs]);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;

    // Pause auto-scroll while user is manually navigating
    pausedRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, 2000);

    el.scrollBy({ left: dir === "left" ? -360 : 360, behavior: "smooth" });
  }, []);

  if (!isLoading && jobs.length === 0) return null;

  return (
    <section className="w-screen relative left-1/2 -translate-x-1/2 space-y-8">
      <div className="max-w-7xl mx-auto px-6 flex items-end justify-between">
        <h2 className="text-[36px] md:text-[42px] font-light text-white">Created by Our Community</h2>
        {!isLoading && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="size-10 rounded-full border border-white/[0.12] flex items-center justify-center text-white/50 hover:text-white hover:border-white/[0.25] transition-all"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="size-10 rounded-full border border-white/[0.12] flex items-center justify-center text-white/50 hover:text-white hover:border-white/[0.25] transition-all"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-6 py-2 -my-2 pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-[340px] rounded-2xl overflow-hidden bg-white/[0.03] border border-white/[0.08]"
            >
              <div className="aspect-[9/16] bg-white/[0.04] animate-pulse" />
              <div className="px-5 py-4 space-y-2">
                <div className="h-3 w-16 rounded bg-white/[0.06] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide py-2 -my-2 pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
        >
          {jobs.map((job) => (
            <CarouselCard key={job.id} job={job} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
          ))}
          <div className="shrink-0 w-6" />
        </div>
      )}
    </section>
  );
}
