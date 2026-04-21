-- CreateTable
CREATE TABLE "TweakMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "TweakMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TweakMessage_jobId_createdAt_idx" ON "TweakMessage"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "TweakMessage" ADD CONSTRAINT "TweakMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PipelineJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
