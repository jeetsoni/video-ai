-- CreateTable
CREATE TABLE "BrowserUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserUser_pkey" PRIMARY KEY ("id")
);

-- Create a default browser user for existing jobs
INSERT INTO "BrowserUser" ("id", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000000', NOW(), NOW());

-- AlterTable: add column with a default first, then remove the default
ALTER TABLE "PipelineJob" ADD COLUMN "browserId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE "PipelineJob" ALTER COLUMN "browserId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "PipelineJob_browserId_idx" ON "PipelineJob"("browserId");

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
