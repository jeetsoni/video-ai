import type { PrismaClient, ScriptTweakMessage } from "@prisma/client";
import type {
  ScriptTweakMessageRepository,
  CreateScriptTweakMessageParams,
} from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";

export class PrismaScriptTweakMessageRepository implements ScriptTweakMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByJobId(jobId: string): Promise<ScriptTweakMessage[]> {
    return this.prisma.scriptTweakMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findRecentByJobId(
    jobId: string,
    limit: number,
  ): Promise<ScriptTweakMessage[]> {
    const messages = await this.prisma.scriptTweakMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return messages.reverse();
  }

  async create(
    params: CreateScriptTweakMessageParams,
  ): Promise<ScriptTweakMessage> {
    return this.prisma.scriptTweakMessage.create({
      data: {
        jobId: params.jobId,
        role: params.role,
        content: params.content,
      },
    });
  }
}
