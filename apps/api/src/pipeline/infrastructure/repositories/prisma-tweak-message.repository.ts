import type { PrismaClient, TweakMessage } from "@prisma/client";
import type {
  TweakMessageRepository,
  CreateTweakMessageParams,
} from "@/pipeline/domain/interfaces/repositories/tweak-message-repository.js";

export class PrismaTweakMessageRepository implements TweakMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByJobId(jobId: string): Promise<TweakMessage[]> {
    return this.prisma.tweakMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findRecentByJobId(
    jobId: string,
    limit: number,
  ): Promise<TweakMessage[]> {
    const messages = await this.prisma.tweakMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return messages.reverse();
  }

  async create(params: CreateTweakMessageParams): Promise<TweakMessage> {
    return this.prisma.tweakMessage.create({
      data: {
        jobId: params.jobId,
        role: params.role,
        content: params.content,
      },
    });
  }
}
