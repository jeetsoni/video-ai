"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Volume2, VolumeX } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";

const PAGE_LIMIT = 12;

function ShowcaseCard({ job, muted, onToggleMute }: { job: PipelineJobDto; muted: boolean; onToggleMute: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.load(); // resets to poster frame
  }, []);

  return (
    <div
      className="group rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-[9/16] bg-surface-container-high flex items-center justify-center">
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

            {!isHovered && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="size-10 rounded-full bg-black/50 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[12px] border-l-white ml-1" />
                </div>
              </div>
            )}

            {isHovered && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
                className="absolute bottom-3 right-3 size-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            )}
          </>
        ) : job.thumbnailUrl ? (
          <img src={job.thumbnailUrl} alt={job.topic} className="size-full object-cover" />
        ) : (
          <Film className="size-8 text-on-surface-variant/30" />
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-medium text-on-surface line-clamp-2">{job.topic}</p>
      </div>
    </div>
  );
}

export function ShowcaseWall() {
  const { pipelineRepository } = useAppDependencies();

  const [jobs, setJobs] = useState<PipelineJobDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const isLoadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);
      try {
        const res = await pipelineRepository.listShowcase(pageNum, PAGE_LIMIT);
        setJobs((prev) => (pageNum === 1 ? res.jobs : [...prev, ...res.jobs]));
        setHasMore(pageNum * PAGE_LIMIT < res.total);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [pipelineRepository],
  );

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPage((p) => {
            const next = p + 1;
            loadPage(next);
            return next;
          });
        }
      },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadPage]);

  if (!isLoading && jobs.length === 0) return null;

  return (
    <section className="space-y-8">
      <div className="border-b border-outline-variant pb-4">
        <h2 className="text-xl font-bold tracking-tight text-on-surface">Showcase</h2>
        <p className="text-sm text-on-surface-variant mt-1">Videos created on the platform</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {jobs.map((job) => (
          <ShowcaseCard key={job.id} job={job} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
        ))}
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl aspect-[9/16] bg-surface-container-high animate-pulse"
            />
          ))}
      </div>

      {hasMore && <div ref={sentinelRef} className="h-4" />}
    </section>
  );
}
