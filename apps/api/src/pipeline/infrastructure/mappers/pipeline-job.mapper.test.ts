import type { PipelineJob as PrismaPipelineJob } from "@prisma/client";
import { PipelineJobMapper } from "./pipeline-job.mapper.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";

describe("PipelineJobMapper", () => {
  const basePrismaRecord: PrismaPipelineJob = {
    id: "test-id-123",
    topic: "How async/await works in JavaScript",
    format: "short",
    themeId: "studio",
    status: "pending",
    stage: "script_generation",
    errorCode: null,
    errorMessage: null,
    generatedScript: null,
    approvedScript: null,
    audioPath: null,
    transcript: null,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    progressPercent: 0,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  describe("toDomain", () => {
    it("should map a basic Prisma record to a domain entity", () => {
      const job = PipelineJobMapper.toDomain(basePrismaRecord);

      expect(job.id).toBe("test-id-123");
      expect(job.topic).toBe("How async/await works in JavaScript");
      expect(job.format.value).toBe("short");
      expect(job.themeId.value).toBe("studio");
      expect(job.status.value).toBe("pending");
      expect(job.stage.value).toBe("script_generation");
      expect(job.error).toBeNull();
      expect(job.progressPercent).toBe(0);
    });

    it("should map error fields when both errorCode and errorMessage exist", () => {
      const record: PrismaPipelineJob = {
        ...basePrismaRecord,
        status: "failed",
        errorCode: "script_generation_failed",
        errorMessage: "LLM returned empty response",
      };

      const job = PipelineJobMapper.toDomain(record);

      expect(job.error).not.toBeNull();
      expect(job.error!.code).toBe("script_generation_failed");
      expect(job.error!.message).toBe("LLM returned empty response");
    });

    it("should not create error when only errorCode exists", () => {
      const record: PrismaPipelineJob = {
        ...basePrismaRecord,
        errorCode: "script_generation_failed",
        errorMessage: null,
      };

      const job = PipelineJobMapper.toDomain(record);
      expect(job.error).toBeNull();
    });

    it("should map JSON fields (transcript, scenePlan, sceneDirections)", () => {
      const transcript = [{ word: "hello", start: 0, end: 0.5 }];
      const scenePlan = [{ id: 1, name: "Hook", type: "Hook", startTime: 0, endTime: 5, text: "hello" }];

      const record: PrismaPipelineJob = {
        ...basePrismaRecord,
        transcript,
        scenePlan,
        sceneDirections: null,
      };

      const job = PipelineJobMapper.toDomain(record);

      expect(job.transcript).toEqual(transcript);
      expect(job.scenePlan).toEqual(scenePlan);
      expect(job.sceneDirections).toBeNull();
    });
  });

  describe("toPersistence", () => {
    it("should map a domain entity to a Prisma-compatible object", () => {
      const format = VideoFormat.create("reel").getValue();
      const themeId = AnimationThemeId.create("neon").getValue();

      const job = PipelineJob.create({
        id: "job-456",
        topic: "Rust ownership model",
        format,
        themeId,
      });

      const data = PipelineJobMapper.toPersistence(job);

      expect(data.id).toBe("job-456");
      expect(data.topic).toBe("Rust ownership model");
      expect(data.format).toBe("reel");
      expect(data.themeId).toBe("neon");
      expect(data.status).toBe("pending");
      expect(data.stage).toBe("script_generation");
      expect(data.errorCode).toBeNull();
      expect(data.errorMessage).toBeNull();
      expect(data.progressPercent).toBe(0);
    });

    it("should round-trip: toPersistence then toDomain preserves all fields", () => {
      const format = VideoFormat.create("longform").getValue();
      const themeId = AnimationThemeId.create("ocean").getValue();

      const original = PipelineJob.create({
        id: "round-trip-id",
        topic: "GraphQL vs REST",
        format,
        themeId,
      });

      const persisted = PipelineJobMapper.toPersistence(original);
      const reconstituted = PipelineJobMapper.toDomain(persisted as PrismaPipelineJob);

      expect(reconstituted.id).toBe(original.id);
      expect(reconstituted.topic).toBe(original.topic);
      expect(reconstituted.format.value).toBe(original.format.value);
      expect(reconstituted.themeId.value).toBe(original.themeId.value);
      expect(reconstituted.status.value).toBe(original.status.value);
      expect(reconstituted.stage.value).toBe(original.stage.value);
      expect(reconstituted.error).toBeNull();
      expect(reconstituted.progressPercent).toBe(original.progressPercent);
    });
  });
});
