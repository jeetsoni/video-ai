import type { TweakMessage } from "@prisma/client";

export interface CreateTweakMessageParams {
  jobId: string;
  role: string;
  content: string;
}

export interface TweakMessageRepository {
  findByJobId(jobId: string): Promise<TweakMessage[]>;
  findRecentByJobId(jobId: string, limit: number): Promise<TweakMessage[]>;
  create(params: CreateTweakMessageParams): Promise<TweakMessage>;
}
