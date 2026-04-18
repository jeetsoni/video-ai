"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineJobDto } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { JobListTable } from "@/features/pipeline/components/job-list-table";
import { Button } from "@/shared/components/ui/button";

const PAGE_LIMIT = 10;

export default function Home() {
  const router = useRouter();
  const { pipelineRepository } = useAppDependencies();

  const [jobs, setJobs] = useState<PipelineJobDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const res = await pipelineRepository.listJobs(p, PAGE_LIMIT);
        setJobs(res.jobs);
        setTotal(res.total);
        setPage(res.page);
      } finally {
        setIsLoading(false);
      }
    },
    [pipelineRepository],
  );

  useEffect(() => {
    fetchJobs(page);
  }, [fetchJobs, page]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight text-on-surface">Video AI</h1>
        <Button onClick={() => router.push("/create")}>Create New Video</Button>
      </div>

      {isLoading ? (
        <p className="text-on-surface-variant">Loading jobs…</p>
      ) : (
        <JobListTable
          jobs={jobs}
          total={total}
          page={page}
          limit={PAGE_LIMIT}
          onPageChange={setPage}
          onJobClick={(jobId) => router.push(`/jobs/${jobId}`)}
        />
      )}
    </main>
  );
}
