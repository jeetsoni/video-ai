import { PrismaClient } from "@prisma/client";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { PipelineJobMapper } from "@/pipeline/infrastructure/mappers/pipeline-job.mapper.js";

export class PrismaPipelineJobRepository implements PipelineJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(job: PipelineJob): Promise<void> {
    const data = PipelineJobMapper.toPersistence(job);
    const { id, ...fields } = data;

    await this.prisma.pipelineJob.upsert({
      where: { id },
      create: data as Parameters<typeof this.prisma.pipelineJob.create>[0]["data"],
      update: fields as Parameters<typeof this.prisma.pipelineJob.update>[0]["data"],
    });
  }

  async findById(id: string): Promise<PipelineJob | null> {
    const record = await this.prisma.pipelineJob.findUnique({
      where: { id },
    });

    if (!record) return null;

    return PipelineJobMapper.toDomain(record);
  }

  async findAll(page: number, limit: number, browserId?: string): Promise<PipelineJob[]> {
    const where = browserId ? { browserId } : {};
    const records = await this.prisma.pipelineJob.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return records.map(PipelineJobMapper.toDomain);
  }

  async count(browserId?: string): Promise<number> {
    const where = browserId ? { browserId } : {};
    return this.prisma.pipelineJob.count({ where });
  }
}
