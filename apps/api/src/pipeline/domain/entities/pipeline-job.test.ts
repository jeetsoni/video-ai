import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { JobError } from "@/pipeline/domain/value-objects/job-error.js";
import type {
  WordTimestamp,
  SceneBoundary,
  SceneDirection,
} from "@video-ai/shared";

function makeJob() {
  return PipelineJob.create({
    id: "job-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
  });
}

function makeSceneBoundary(): SceneBoundary {
  return {
    id: 1,
    name: "Hook",
    type: "Hook",
    startTime: 0,
    endTime: 5,
    text: "Hello world",
  };
}

function makeSceneDirection(): SceneDirection {
  return {
    id: 1,
    name: "Hook",
    type: "Hook",
    description: "Opening hook",
    startTime: 0,
    endTime: 5,
    startFrame: 0,
    endFrame: 150,
    durationFrames: 150,
    text: "Hello world",
    words: [
      { word: "Hello", start: 0, end: 2 },
      { word: "world", start: 2, end: 5 },
    ],
    animationDirection: {
      colorAccent: "#06B6D4",
      mood: "energetic",
      layout: "center",
      beats: [],
    },
  };
}

describe("PipelineJob", () => {
  describe("create", () => {
    it("creates a job with pending status and script_generation stage", () => {
      const job = makeJob();
      expect(job.id).toBe("job-1");
      expect(job.topic).toBe("How databases work");
      expect(job.format.value).toBe("short");
      expect(job.themeId.value).toBe("studio");
      expect(job.voiceId).toBeNull();
      expect(job.status.value).toBe("pending");
      expect(job.stage.value).toBe("script_generation");
      expect(job.progressPercent).toBe(0);
      expect(job.error).toBeNull();
      expect(job.generatedScript).toBeNull();
      expect(job.approvedScript).toBeNull();
      expect(job.generatedScenes).toBeNull();
      expect(job.approvedScenes).toBeNull();
      expect(job.audioPath).toBeNull();
      expect(job.transcript).toBeNull();
      expect(job.scenePlan).toBeNull();
      expect(job.sceneDirections).toBeNull();
      expect(job.generatedCode).toBeNull();
      expect(job.codePath).toBeNull();
      expect(job.videoPath).toBeNull();
    });
  });

  describe("reconstitute", () => {
    it("rebuilds a job from persistence data", () => {
      const now = new Date();
      const error = JobError.create(
        "script_generation_failed",
        "LLM timeout",
      ).getValue();
      const job = PipelineJob.reconstitute({
        id: "job-2",
        topic: "AI basics",
        format: VideoFormat.create("reel").getValue(),
        themeId: AnimationThemeId.create("neon").getValue(),
        voiceId: null,
        status: PipelineStatus.failed(),
        stage: PipelineStage.create("script_generation")!,
        error,
        generatedScript: null,
        approvedScript: null,
        generatedScenes: null,
        approvedScenes: null,
        audioPath: null,
        transcript: null,
        scenePlan: null,
        sceneDirections: null,
        generatedCode: null,
        codePath: null,
        videoPath: null,
        progressPercent: 10,
        createdAt: now,
        updatedAt: now,
      });
      expect(job.id).toBe("job-2");
      expect(job.status.value).toBe("failed");
      expect(job.error?.code).toBe("script_generation_failed");
    });

    it("rebuilds a job with generatedScenes and approvedScenes", () => {
      const now = new Date();
      const scenes = [makeSceneBoundary()];
      const job = PipelineJob.reconstitute({
        id: "job-3",
        topic: "Scene test",
        format: VideoFormat.create("short").getValue(),
        themeId: AnimationThemeId.create("studio").getValue(),
        voiceId: null,
        status: PipelineStatus.processing(),
        stage: PipelineStage.create("tts_generation")!,
        error: null,
        generatedScript: "Hello world",
        approvedScript: "Hello world",
        generatedScenes: scenes,
        approvedScenes: scenes,
        audioPath: null,
        transcript: null,
        scenePlan: null,
        sceneDirections: null,
        generatedCode: null,
        codePath: null,
        videoPath: null,
        progressPercent: 30,
        createdAt: now,
        updatedAt: now,
      });
      expect(job.generatedScenes).toEqual(scenes);
      expect(job.approvedScenes).toEqual(scenes);
    });
  });

  describe("transitionTo", () => {
    it("follows the happy path through all stages", () => {
      const job = makeJob();
      const stages: Array<{ stage: string; status: string; progress: number }> =
        [
          {
            stage: "script_review",
            status: "awaiting_script_review",
            progress: 15,
          },
          { stage: "tts_generation", status: "processing", progress: 30 },
          { stage: "transcription", status: "processing", progress: 45 },
          { stage: "timestamp_mapping", status: "processing", progress: 55 },
          { stage: "direction_generation", status: "processing", progress: 65 },
          { stage: "code_generation", status: "processing", progress: 80 },
          { stage: "preview", status: "completed", progress: 95 },
          { stage: "rendering", status: "processing", progress: 90 },
          { stage: "done", status: "completed", progress: 100 },
        ];

      for (const expected of stages) {
        const result = job.transitionTo(expected.stage as any);
        expect(result.isSuccess).toBe(true);
        expect(job.stage.value).toBe(expected.stage);
        expect(job.status.value).toBe(expected.status);
        expect(job.progressPercent).toBe(expected.progress);
      }
    });

    it("rejects invalid transitions", () => {
      const job = makeJob(); // at script_generation
      const result = job.transitionTo("done");
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("INVALID_TRANSITION");
    });

    it("rejects transitions from terminal status", () => {
      const job = makeJob();
      job.markFailed("script_generation_failed", "LLM error");
      const result = job.transitionTo("script_review");
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain("terminal status");
    });

    it("rejects invalid stage values", () => {
      const job = makeJob();
      const result = job.transitionTo("nonexistent_stage" as any);
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("INVALID_STAGE");
    });

    it("allows backward transition: script_review → script_generation", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      const result = job.transitionTo("script_generation");
      expect(result.isSuccess).toBe(true);
      expect(job.stage.value).toBe("script_generation");
      expect(job.status.value).toBe("processing");
    });

    it("updates updatedAt on transition", () => {
      const job = makeJob();
      const before = job.updatedAt;
      job.transitionTo("script_review");
      expect(job.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("markFailed", () => {
    it("sets status to failed with error details", () => {
      const job = makeJob();
      const result = job.markFailed("script_generation_failed", "LLM timeout");
      expect(result.isSuccess).toBe(true);
      expect(job.status.value).toBe("failed");
      expect(job.error).not.toBeNull();
      expect(job.error!.code).toBe("script_generation_failed");
      expect(job.error!.message).toBe("LLM timeout");
    });

    it("rejects invalid error codes", () => {
      const job = makeJob();
      const result = job.markFailed("invalid_code" as any, "some error");
      expect(result.isFailure).toBe(true);
    });

    it("rejects empty error messages", () => {
      const job = makeJob();
      const result = job.markFailed("script_generation_failed", "");
      expect(result.isFailure).toBe(true);
    });
  });

  describe("artifact setters", () => {
    it("setScript succeeds in script_generation stage with scenes", () => {
      const job = makeJob();
      const scenes = [makeSceneBoundary()];
      const result = job.setScript("Hello, this is a test script.", scenes);
      expect(result.isSuccess).toBe(true);
      expect(job.generatedScript).toBe("Hello, this is a test script.");
      expect(job.generatedScenes).toEqual(scenes);
    });

    it("setScript fails in wrong stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      const result = job.setScript("script", [makeSceneBoundary()]);
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("INVALID_STAGE_FOR_ARTIFACT");
    });

    it("setApprovedScript succeeds in script_review stage with scenes", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      const scenes = [makeSceneBoundary()];
      const result = job.setApprovedScript("Approved script text", scenes);
      expect(result.isSuccess).toBe(true);
      expect(job.approvedScript).toBe("Approved script text");
      expect(job.approvedScenes).toEqual(scenes);
    });

    it("setApprovedScript fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setApprovedScript("script", [makeSceneBoundary()]);
      expect(result.isFailure).toBe(true);
    });

    it("setAudioPath succeeds in tts_generation stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      const result = job.setAudioPath("audio/job-1.mp3");
      expect(result.isSuccess).toBe(true);
      expect(job.audioPath).toBe("audio/job-1.mp3");
    });

    it("setAudioPath fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setAudioPath("audio/job-1.mp3");
      expect(result.isFailure).toBe(true);
    });

    it("setTranscript succeeds in transcription stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      job.transitionTo("transcription");
      const words: WordTimestamp[] = [{ word: "Hello", start: 0, end: 0.5 }];
      const result = job.setTranscript(words);
      expect(result.isSuccess).toBe(true);
      expect(job.transcript).toEqual(words);
    });

    it("setTranscript fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setTranscript([]);
      expect(result.isFailure).toBe(true);
    });

    it("setScenePlan succeeds in timestamp_mapping stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      job.transitionTo("transcription");
      job.transitionTo("timestamp_mapping");
      const plan = [makeSceneBoundary()];
      const result = job.setScenePlan(plan);
      expect(result.isSuccess).toBe(true);
      expect(job.scenePlan).toEqual(plan);
    });

    it("setScenePlan fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setScenePlan([]);
      expect(result.isFailure).toBe(true);
    });

    it("setSceneDirections succeeds in direction_generation stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      job.transitionTo("transcription");
      job.transitionTo("timestamp_mapping");
      job.transitionTo("direction_generation");
      const directions = [makeSceneDirection()];
      const result = job.setSceneDirections(directions);
      expect(result.isSuccess).toBe(true);
      expect(job.sceneDirections).toEqual(directions);
    });

    it("setSceneDirections fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setSceneDirections([]);
      expect(result.isFailure).toBe(true);
    });

    it("setGeneratedCode succeeds in code_generation stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      job.transitionTo("transcription");
      job.transitionTo("timestamp_mapping");
      job.transitionTo("direction_generation");
      job.transitionTo("code_generation");
      const result = job.setGeneratedCode(
        "export const Main = () => <div/>;",
        "code/job-1.tsx",
      );
      expect(result.isSuccess).toBe(true);
      expect(job.generatedCode).toBe("export const Main = () => <div/>;");
      expect(job.codePath).toBe("code/job-1.tsx");
    });

    it("setGeneratedCode fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setGeneratedCode("code");
      expect(result.isFailure).toBe(true);
    });

    it("setVideoPath succeeds in rendering stage", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      job.transitionTo("tts_generation");
      job.transitionTo("transcription");
      job.transitionTo("timestamp_mapping");
      job.transitionTo("direction_generation");
      job.transitionTo("code_generation");
      job.transitionTo("preview");
      job.transitionTo("rendering");
      const result = job.setVideoPath("videos/job-1.mp4");
      expect(result.isSuccess).toBe(true);
      expect(job.videoPath).toBe("videos/job-1.mp4");
    });

    it("setVideoPath fails in wrong stage", () => {
      const job = makeJob();
      const result = job.setVideoPath("videos/job-1.mp4");
      expect(result.isFailure).toBe(true);
    });
  });

  describe("generatedScenes and approvedScenes getters", () => {
    it("returns null when no scenes have been set", () => {
      const job = makeJob();
      expect(job.generatedScenes).toBeNull();
      expect(job.approvedScenes).toBeNull();
    });

    it("returns generatedScenes after setScript", () => {
      const job = makeJob();
      const scenes = [makeSceneBoundary()];
      job.setScript("Hello world", scenes);
      expect(job.generatedScenes).toEqual(scenes);
    });

    it("returns approvedScenes after setApprovedScript", () => {
      const job = makeJob();
      job.transitionTo("script_review");
      const scenes = [makeSceneBoundary()];
      job.setApprovedScript("Hello world", scenes);
      expect(job.approvedScenes).toEqual(scenes);
    });
  });
});
