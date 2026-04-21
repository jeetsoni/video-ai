-- CreateTable
CREATE TABLE "ScriptTweakMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ScriptTweakMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScriptTweakMessage_jobId_createdAt_idx" ON "ScriptTweakMessage"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScriptTweakMessage" ADD CONSTRAINT "ScriptTweakMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PipelineJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
