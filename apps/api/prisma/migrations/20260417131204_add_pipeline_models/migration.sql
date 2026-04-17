-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('pending', 'processing', 'awaiting_script_review', 'awaiting_scene_plan_review', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('script_generation', 'script_review', 'tts_generation', 'transcription', 'scene_planning', 'scene_plan_review', 'direction_generation', 'code_generation', 'rendering', 'done');

-- CreateEnum
CREATE TYPE "VideoFormat" AS ENUM ('reel', 'short', 'longform');

-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "topic" VARCHAR(500) NOT NULL,
    "format" "VideoFormat" NOT NULL,
    "themeId" TEXT NOT NULL,
    "status" "PipelineStatus" NOT NULL DEFAULT 'pending',
    "stage" "PipelineStage" NOT NULL DEFAULT 'script_generation',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "generatedScript" TEXT,
    "approvedScript" TEXT,
    "audioPath" TEXT,
    "transcript" JSONB,
    "scenePlan" JSONB,
    "sceneDirections" JSONB,
    "generatedCode" TEXT,
    "codePath" TEXT,
    "videoPath" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimationTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "palette" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnimationTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineJob_status_idx" ON "PipelineJob"("status");

-- CreateIndex
CREATE INDEX "PipelineJob_createdAt_idx" ON "PipelineJob"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AnimationTheme_sortOrder_idx" ON "AnimationTheme"("sortOrder");
