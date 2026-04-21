import type { ScriptTweakMessage } from "@prisma/client";

export interface CreateScriptTweakMessageParams {
  jobId: string;
  role: string;
  content: string;
}

export interface ScriptTweakMessageRepository {
  findByJobId(jobId: string): Promise<ScriptTweakMessage[]>;
  findRecentByJobId(
    jobId: string,
    limit: number,
  ): Promise<ScriptTweakMessage[]>;
  create(params: CreateScriptTweakMessageParams): Promise<ScriptTweakMessage>;
}
