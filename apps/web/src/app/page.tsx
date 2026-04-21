"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { PipelineJobDto } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { DraftHero } from "@/features/pipeline/components/draft-hero";
import { ProjectCard } from "@/features/pipeline/components/project-card";
import { ProjectCardSkeleton } from "@/features/pipeline/components/project-card-skeleton";
import { ShowcaseWall } from "@/features/pipeline/components/showcase-wall";

const PAGE_LIMIT = 8;

export default function Home() {
  const router = useRouter();
  const { pipelineRepository } = useAppDependencies();

  const [jobs, setJobs] = useState<PipelineJobDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await pipelineRepository.listJobs(1, PAGE_LIMIT);
      setJobs(res.jobs);
    } finally {
      setIsLoading(false);
    }
  }, [pipelineRepository]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <main className="p-8 max-w-6xl mx-auto space-y-16">
      <DraftHero />

      <section className="space-y-8">
        <div className="flex items-center justify-between border-b border-outline-variant pb-4">
          <h2 className="text-xl font-bold tracking-tight text-on-surface">
            Recent Projects
          </h2>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            All Projects
            <ArrowRight className="size-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))
            : jobs.map((job) => (
                <ProjectCard
                  key={job.id}
                  job={job}
                  onClick={(id) => router.push(`/jobs/${id}`)}
                />
              ))}
        </div>

        {!isLoading && jobs.length === 0 && (
          <p className="text-center text-on-surface-variant py-12">
            No projects yet. Start by drafting your first video above.
          </p>
        )}
      </section>

      <ShowcaseWall />
    </main>
  );
}
