"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineJobDto } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { ProjectCard } from "@/features/pipeline/components/project-card";
import { ProjectCardSkeleton } from "@/features/pipeline/components/project-card-skeleton";

const PAGE_LIMIT = 20;

export default function ProjectsPage() {
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
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-light tracking-tight text-white">My Projects</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <ProjectCardSkeleton key={i} />)
          : jobs.map((job) => (
              <ProjectCard key={job.id} job={job} onClick={(id) => router.push(`/jobs/${id}`)} />
            ))}
      </div>

      {!isLoading && jobs.length === 0 && (
        <p className="text-center text-white/40 py-12">
          No projects yet. Go create your first video!
        </p>
      )}
    </main>
  );
}
