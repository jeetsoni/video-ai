/**
 * Property-Based Tests for PipelineStage transition graph correctness
 *
 * Feature: comprehensive-test-coverage, Property 2: PipelineStage transition graph correctness
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */
import fc from "fast-check";
import type { PipelineStage as PipelineStageType } from "@video-ai/shared";
import { PipelineStage } from "./pipeline-stage.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";

// --- Arbitraries ---

/** All 10 valid pipeline stage values */
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
];

/** Arbitrary that generates any of the 10 valid pipeline stage values */
const pipelineStageArb = fc.constantFrom(...ALL_STAGES);

/** Arbitrary that generates a pair of pipeline stage values */
const stagePairArb = fc.tuple(pipelineStageArb, pipelineStageArb);

// --- Factory helpers ---

/**
 * The canonical path through the pipeline from script_generation to done.
 * Used by makeJobAtStage to walk the transition graph.
 */
const MAIN_PATH: readonly PipelineStageType[] = [
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
];

/**
 * Creates a PipelineJob at the given target stage by walking the transition graph
 * from the initial stage (script_generation) along the main path.
 */
function makeJobAtStage(targetStage: PipelineStageType): PipelineJob {
  const job = PipelineJob.create({
    id: "test-job",
    browserId: "test-browser",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
  });

  // Walk the main path until we reach the target stage
  for (const stage of MAIN_PATH) {
    if (stage === "script_generation") {
      // Already at initial stage
      if (targetStage === "script_generation") break;
      continue;
    }
    const result = job.transitionTo(stage);
    if (result.isFailure) {
      throw new Error(
        `makeJobAtStage: failed to transition to "${stage}": ${result.getError().message}`,
      );
    }
    if (stage === targetStage) break;
  }

  return job;
}

// --- Properties ---

describe("Feature: comprehensive-test-coverage, Property 2: PipelineStage transition graph correctness", () => {
  /**
   * Property 2a: For all stage pairs where canTransitionTo returns true,
   * PipelineJob.transitionTo succeeds and stage equals target.
   *
   * **Validates: Requirements 10.1**
   */
  it("valid transitions succeed and update stage to target", () => {
    fc.assert(
      fc.property(stagePairArb, ([sourceStage, targetStage]) => {
        const sourceStageObj = PipelineStage.create(sourceStage)!;
        const targetStageObj = PipelineStage.create(targetStage)!;

        // Only test pairs where canTransitionTo returns true
        fc.pre(sourceStageObj.canTransitionTo(targetStageObj));

        const job = makeJobAtStage(sourceStage);
        const result = job.transitionTo(targetStage);

        expect(result.isSuccess).toBe(true);
        expect(job.stage.value).toBe(targetStage);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2b: For all stage pairs where canTransitionTo returns false,
   * PipelineJob.transitionTo returns a failed Result with code "INVALID_TRANSITION".
   *
   * **Validates: Requirements 10.2**
   */
  it("invalid transitions return failed Result with code INVALID_TRANSITION", () => {
    fc.assert(
      fc.property(stagePairArb, ([sourceStage, targetStage]) => {
        const sourceStageObj = PipelineStage.create(sourceStage)!;
        const targetStageObj = PipelineStage.create(targetStage)!;

        // Only test pairs where canTransitionTo returns false
        fc.pre(!sourceStageObj.canTransitionTo(targetStageObj));

        const job = makeJobAtStage(sourceStage);
        const result = job.transitionTo(targetStage);

        expect(result.isFailure).toBe(true);
        expect(result.getError().code).toBe("INVALID_TRANSITION");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2c: For all valid stage strings, PipelineStage.create returns non-null.
   *
   * **Validates: Requirements 10.3**
   */
  it("PipelineStage.create returns non-null for all valid stage strings", () => {
    fc.assert(
      fc.property(pipelineStageArb, (stage) => {
        const result = PipelineStage.create(stage);
        expect(result).not.toBeNull();
        expect(result!.value).toBe(stage);
      }),
      { numRuns: 100 },
    );
  });
});
