"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { VideoFormat } from "@video-ai/shared";
import { useAppDependencies } from "@/shared/providers/app-dependencies-context";
import { useCreatePipeline } from "@/features/pipeline/hooks/use-create-pipeline";
import { PipelineWizard } from "@/features/pipeline/components/pipeline-wizard";

export default function CreatePage() {
  const router = useRouter();
  const { pipelineRepository } = useAppDependencies();

  const { isSubmitting, setTopic, setFormat, setThemeId } =
    useCreatePipeline({
      repository: pipelineRepository,
      onSuccess: (response) => {
        router.push(`/jobs/${response.jobId}`);
      },
    });

  const handleSubmit = useCallback(
    async (data: { topic: string; format: VideoFormat; themeId: string }) => {
      setTopic(data.topic);
      setFormat(data.format);
      setThemeId(data.themeId);

      await pipelineRepository
        .createJob(data)
        .then((res) => router.push(`/jobs/${res.jobId}`));
    },
    [pipelineRepository, router, setTopic, setFormat, setThemeId],
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Create New Video</h1>
      <PipelineWizard onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </main>
  );
}
