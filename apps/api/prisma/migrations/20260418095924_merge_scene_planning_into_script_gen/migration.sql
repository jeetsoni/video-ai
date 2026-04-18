/*
  Warnings:

  - The values [scene_planning,scene_plan_review] on the enum `PipelineStage` will be removed. If these variants are still used in the database, this will fail.
  - The values [awaiting_scene_plan_review] on the enum `PipelineStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PipelineStage_new" AS ENUM ('script_generation', 'script_review', 'tts_generation', 'transcription', 'timestamp_mapping', 'direction_generation', 'code_generation', 'rendering', 'done');
ALTER TABLE "public"."PipelineJob" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "PipelineJob" ALTER COLUMN "stage" TYPE "PipelineStage_new" USING ("stage"::text::"PipelineStage_new");
ALTER TYPE "PipelineStage" RENAME TO "PipelineStage_old";
ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";
DROP TYPE "public"."PipelineStage_old";
ALTER TABLE "PipelineJob" ALTER COLUMN "stage" SET DEFAULT 'script_generation';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PipelineStatus_new" AS ENUM ('pending', 'processing', 'awaiting_script_review', 'completed', 'failed');
ALTER TABLE "public"."PipelineJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PipelineJob" ALTER COLUMN "status" TYPE "PipelineStatus_new" USING ("status"::text::"PipelineStatus_new");
ALTER TYPE "PipelineStatus" RENAME TO "PipelineStatus_old";
ALTER TYPE "PipelineStatus_new" RENAME TO "PipelineStatus";
DROP TYPE "public"."PipelineStatus_old";
ALTER TABLE "PipelineJob" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterTable
ALTER TABLE "PipelineJob" ADD COLUMN     "approvedScenes" JSONB,
ADD COLUMN     "generatedScenes" JSONB;
