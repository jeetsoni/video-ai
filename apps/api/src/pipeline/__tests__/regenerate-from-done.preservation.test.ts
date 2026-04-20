/**
 * Preservation Property Tests — Non-Done Terminal Transitions and Existing Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests capture the CURRENT behavior on UNFIXED code to ensure
 * the fix does not introduce regressions. All tests here must PASS
 * on both unfixed and fixed code.
 */
import fc from "fast-check";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import type { PipelineStage as PipelineStageType } from "@video-ai/shared";

// --- Constants ---

const ALL_STAGES: readonly PipelineStageType[] = [
  "script_generation",
  "script_review",
  "tts_generation",
  "transcription",
  "timestamp_mapping",
  "direction_generation",
  "code_generation",
  "preview",
  "rendering",
  "done",
] as const;

const TERMINAL_STATUSES = ["completed", "failed"] as const;
const NON_TERMINAL_STATUSES = [
  "pending",
  "processing",
  "awaiting_script_review",
] as const;

const VALID_TRANSITIONS: ReadonlyMap<
  PipelineStageType,
  readonly PipelineStageType[]
> = new Map([
  ["script_generation", ["script_review"]],
  ["script_review", ["tts_generation", "script_generation"]],
  ["tts_generation", ["transcription"]],
  ["transcription", ["timestamp_mapping"]],
  ["timestamp_mapping", ["direction_generation"]],
  ["direction_generation", ["code_generation"]],
  ["code_generation", ["preview"]],
  ["preview", ["rendering", "done", "direction_generation"]],
  ["rendering", ["done"]],
  ["done", ["direction_generation"]],
]);

const STAGE_TO_STATUS_MAP: Record<PipelineStageType, string> = {
  script_generation: "processing",
  script_review: "awaiting_script_review",
  tts_generation: "processing",
  transcription: "processing",
  timestamp_mapping: "processing",
  direction_generation: "processing",
  code_generation: "processing",
  preview: "completed",
  rendering: "processing",
  done: "completed",
};

const STAGE_TO_PROGRESS_MAP: Record<PipelineStageType, number> = {
  script_generation: 10,
  script_review: 15,
  tts_generation: 30,
  transcription: 45,
  timestamp_mapping: 55,
  direction_generation: 65,
  code_generation: 80,
  preview: 95,
  rendering: 90,
  done: 100,
};

// --- fast-check arbitraries ---

const topicArb = fc.stringOf(
  fc.char().filter((c) => /[a-zA-Z0-9 ]/.test(c)),
  { minLength: 1, maxLength: 50 },
);

const browserIdArb = fc.stringOf(
  fc.char().filter((c) => /[a-zA-Z0-9\-]/.test(c)),
  { minLength: 1, maxLength: 36 },
);

const jobIdArb = fc.stringOf(
  fc.char().filter((c) => /[a-zA-Z0-9\-]/.test(c)),
  { minLength: 1, maxLength: 36 },
);

const formatArb = fc.constantFrom("reel", "short", "longform") as fc.Arbitrary<
  "reel" | "short" | "longform"
>;

const themeIdArb = fc.stringOf(
  fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
  { minLength: 1, maxLength: 20 },
);

const voiceIdArb = fc.option(
  fc.stringOf(
    fc.char().filter((c) => /[a-zA-Z0-9\-]/.test(c)),
    { minLength: 1, maxLength: 36 },
  ),
  { nil: null },
);

// --- Helpers ---

function reconstituteJob(params: {
  id: string;
  browserId: string;
  topic: string;
  format: "reel" | "short" | "longform";
  themeId: string;
  voiceId: string | null;
  stage: PipelineStageType;
  status: PipelineStatus;
}): PipelineJob {
  const now = new Date();
  return PipelineJob.reconstitute({
    id: params.id,
    browserId: params.browserId,
    topic: params.topic,
    format: VideoFormat.create(params.format).getValue(),
    themeId: AnimationThemeId.create(params.themeId).getValue(),
    voiceId: params.voiceId,
    voiceSettings: null,
    status: params.status,
    stage: PipelineStage.create(params.stage)!,
    error: null,
    generatedScript: "Generated script",
    approvedScript: "Approved script",
    generatedScenes: null,
    approvedScenes: null,
    audioPath: "audio/test.mp3",
    transcript: [{ word: "Hello", start: 0, end: 0.5 }],
    scenePlan: null,
    sceneDirections: null,
    generatedCode: "export const Main = () => <div/>;",
    codePath: "code/test.tsx",
    videoPath: "videos/test.mp4",
    progressPercent: STAGE_TO_PROGRESS_MAP[params.stage],
    createdAt: now,
    updatedAt: now,
  });
}

// --- Observation Tests ---

describe("Preservation Observations (unfixed code baseline)", () => {
  it("observation: preview/completed → direction_generation succeeds", () => {
    const job = reconstituteJob({
      id: "obs-1",
      browserId: "browser-1",
      topic: "test topic",
      format: "reel",
      themeId: "theme1",
      voiceId: null,
      stage: "preview",
      status: PipelineStatus.completed(),
    });

    const result = job.transitionTo("direction_generation");
    expect(result.isSuccess).toBe(true);
    expect(job.stage.value).toBe("direction_generation");
    expect(job.status.value).toBe("processing");
    expect(job.progressPercent).toBe(65);
  });

  it("observation: code_generation/failed blocks transition with terminal status error", () => {
    const job = reconstituteJob({
      id: "obs-2",
      browserId: "browser-1",
      topic: "test topic",
      format: "reel",
      themeId: "theme1",
      voiceId: null,
      stage: "code_generation",
      status: PipelineStatus.failed(),
    });

    const result = job.transitionTo("preview");
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("terminal status");
    expect(result.getError().code).toBe("INVALID_TRANSITION");
  });

  it("observation: script_generation/processing → script_review succeeds (non-terminal)", () => {
    const job = reconstituteJob({
      id: "obs-3",
      browserId: "browser-1",
      topic: "test topic",
      format: "reel",
      themeId: "theme1",
      voiceId: null,
      stage: "script_generation",
      status: PipelineStatus.processing(),
    });

    const result = job.transitionTo("script_review");
    expect(result.isSuccess).toBe(true);
    expect(job.stage.value).toBe("script_review");
  });

  it("observation: done/completed → rendering is rejected by stage transition map (fixed code)", () => {
    const job = reconstituteJob({
      id: "obs-4",
      browserId: "browser-1",
      topic: "test topic",
      format: "reel",
      themeId: "theme1",
      voiceId: null,
      stage: "done",
      status: PipelineStatus.completed(),
    });

    // On fixed code, done is exempted from terminal guard, so the stage
    // transition map rejects invalid targets with "Cannot transition from"
    const result = job.transitionTo("rendering");
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain(
      'Cannot transition from "done" to "rendering"',
    );
    expect(result.getError().code).toBe("INVALID_TRANSITION");
  });
});

// --- Property-Based Tests ---

describe("Preservation Property Tests", () => {
  /**
   * Property: Preview regeneration path preserved
   *
   * For preview stage with completed status, transitionTo("direction_generation")
   * succeeds — stage becomes direction_generation, status becomes processing,
   * progress becomes 65.
   *
   * **Validates: Requirements 3.1**
   */
  it("Property: preview/completed → direction_generation succeeds with correct state", () => {
    fc.assert(
      fc.property(
        jobIdArb,
        browserIdArb,
        topicArb,
        formatArb,
        themeIdArb,
        voiceIdArb,
        (id, browserId, topic, format, themeId, voiceId) => {
          const job = reconstituteJob({
            id,
            browserId,
            topic,
            format,
            themeId,
            voiceId,
            stage: "preview",
            status: PipelineStatus.completed(),
          });

          expect(job.stage.value).toBe("preview");
          expect(job.status.value).toBe("completed");

          const result = job.transitionTo("direction_generation");

          expect(result.isSuccess).toBe(true);
          expect(job.stage.value).toBe("direction_generation");
          expect(job.status.value).toBe("processing");
          expect(job.progressPercent).toBe(65);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Terminal status blocks transitions at non-exempted stages
   *
   * For all stages NOT in {preview, done} with terminal status (completed or failed),
   * transitionTo() to any target returns Result.fail with INVALID_TRANSITION
   * containing "terminal status".
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  it("Property: terminal status at non-preview/non-done stages blocks all transitions", () => {
    const nonExemptStages = ALL_STAGES.filter(
      (s) => s !== "preview" && s !== "done",
    );

    const stageArb = fc.constantFrom(
      ...nonExemptStages,
    ) as fc.Arbitrary<PipelineStageType>;
    const terminalStatusArb = fc.constantFrom(...TERMINAL_STATUSES);
    const targetStageArb = fc.constantFrom(
      ...ALL_STAGES,
    ) as fc.Arbitrary<PipelineStageType>;

    fc.assert(
      fc.property(
        jobIdArb,
        browserIdArb,
        topicArb,
        formatArb,
        themeIdArb,
        voiceIdArb,
        stageArb,
        terminalStatusArb,
        targetStageArb,
        (
          id,
          browserId,
          topic,
          format,
          themeId,
          voiceId,
          stage,
          terminalStatus,
          targetStage,
        ) => {
          const status =
            terminalStatus === "completed"
              ? PipelineStatus.completed()
              : PipelineStatus.failed();

          const job = reconstituteJob({
            id,
            browserId,
            topic,
            format,
            themeId,
            voiceId,
            stage,
            status,
          });

          const result = job.transitionTo(targetStage);

          expect(result.isFailure).toBe(true);
          expect(result.getError().message).toContain("terminal status");
          expect(result.getError().code).toBe("INVALID_TRANSITION");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Non-terminal status transitions work normally
   *
   * For all stages with non-terminal status (pending, processing, awaiting_script_review),
   * valid transitions succeed and invalid transitions are rejected by the stage
   * transition map — not by the terminal guard.
   *
   * **Validates: Requirements 3.2**
   */
  it("Property: non-terminal status — valid transitions succeed, invalid rejected by stage map", () => {
    const stageArb = fc.constantFrom(
      ...ALL_STAGES,
    ) as fc.Arbitrary<PipelineStageType>;
    const nonTerminalStatusArb = fc.constantFrom(...NON_TERMINAL_STATUSES);
    const targetStageArb = fc.constantFrom(
      ...ALL_STAGES,
    ) as fc.Arbitrary<PipelineStageType>;

    fc.assert(
      fc.property(
        jobIdArb,
        browserIdArb,
        topicArb,
        formatArb,
        themeIdArb,
        voiceIdArb,
        stageArb,
        nonTerminalStatusArb,
        targetStageArb,
        (
          id,
          browserId,
          topic,
          format,
          themeId,
          voiceId,
          stage,
          nonTerminalStatus,
          targetStage,
        ) => {
          const status = PipelineStatus.create(nonTerminalStatus)!;

          const job = reconstituteJob({
            id,
            browserId,
            topic,
            format,
            themeId,
            voiceId,
            stage,
            status,
          });

          const validTargets = VALID_TRANSITIONS.get(stage) ?? [];
          const isValidTransition = validTargets.includes(targetStage);

          const result = job.transitionTo(targetStage);

          if (isValidTransition) {
            expect(result.isSuccess).toBe(true);
            expect(job.stage.value).toBe(targetStage);
            expect(job.status.value).toBe(STAGE_TO_STATUS_MAP[targetStage]);
            expect(job.progressPercent).toBe(
              STAGE_TO_PROGRESS_MAP[targetStage],
            );
          } else {
            expect(result.isFailure).toBe(true);
            // Should NOT be blocked by terminal guard — should be rejected by stage map
            expect(result.getError().message).not.toContain("terminal status");
            expect(result.getError().code).toBe("INVALID_TRANSITION");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Done stage rejects invalid targets
   *
   * For done stage, transitionTo() to any target NOT equal to direction_generation
   * returns Result.fail. On unfixed code, done/completed hits the terminal guard
   * first, so the error message is "Cannot transition from terminal status".
   *
   * **Validates: Requirements 3.4**
   */
  it("Property: done stage rejects all targets except direction_generation", () => {
    const invalidTargetsFromDone = ALL_STAGES.filter(
      (s) => s !== "direction_generation",
    );
    const invalidTargetArb = fc.constantFrom(
      ...invalidTargetsFromDone,
    ) as fc.Arbitrary<PipelineStageType>;

    fc.assert(
      fc.property(
        jobIdArb,
        browserIdArb,
        topicArb,
        formatArb,
        themeIdArb,
        voiceIdArb,
        invalidTargetArb,
        (id, browserId, topic, format, themeId, voiceId, targetStage) => {
          const job = reconstituteJob({
            id,
            browserId,
            topic,
            format,
            themeId,
            voiceId,
            stage: "done",
            status: PipelineStatus.completed(),
          });

          const result = job.transitionTo(targetStage);

          // On unfixed code: terminal guard fires first with "terminal status" message
          // On fixed code: stage transition map rejects with "Cannot transition from"
          // Both cases: result is a failure with INVALID_TRANSITION
          expect(result.isFailure).toBe(true);
          expect(result.getError().code).toBe("INVALID_TRANSITION");
        },
      ),
      { numRuns: 100 },
    );
  });
});
