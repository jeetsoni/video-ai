"use client";

import { Button } from "@/shared/components/ui/button";

interface StatsBannerProps {
  totalJobs: number;
  completedJobs: number;
}

export function StatsBanner({ totalJobs, completedJobs }: StatsBannerProps) {
  const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-variant/40 p-6 backdrop-blur-xl">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="label-caps mb-1 block text-secondary tracking-widest">
            Pipeline Overview
          </span>
          <h3 className="text-xl font-bold">
            You have <span className="text-secondary">{totalJobs}</span> total
            projects.
          </h3>
        </div>

        <div className="flex min-w-[200px] items-center gap-4">
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[10px] font-bold uppercase">
              <span className="text-on-surface-variant">Completion</span>
              <span className="text-secondary">{completionRate}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full bg-secondary transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Report
          </Button>
        </div>
      </div>
    </section>
  );
}
