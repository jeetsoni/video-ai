/**
 * Bug Condition Exploration Test — Regeneration From Done Stage Blocked by Terminal Status Guard
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * This test encodes the EXPECTED (correct) behavior:
 * - transitionTo("direction_generation") should succeed when stage is "done" with "completed" status
 * - After transition: stage = "direction_generation", status = "processing", progressPercent = 65
 *
 * On UNFIXED code, this test FAILS — confirming the bug exists.
 * After the fix, this test PASSES — confirming the bug is resolved.
 */
import fc from "fast-check";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";

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

function reconstituteDoneJob(params: {
  id: string;
  browserId: string;
  topic: string;
  format: "reel" | "short" | "longform";
  themeId: string;
  voiceId: string | null;
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
    status: PipelineStatus.completed(),
    stage: PipelineStage.create("done")!,
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
    progressPercent: 100,
    createdAt: now,
    updatedAt: now,
  });
}

// --- Tests ---

describe("Bug Condition Exploration: Regeneration From Done Stage Blocked by Terminal Status Guard", () => {
  it("transitionTo('direction_generation') should succeed from done/completed (property-based)", () => {
    /**
     * Property 1: Bug Condition — Regeneration From Done Stage
     *
     * For any PipelineJob reconstituted at done stage with completed status,
     * transitionTo("direction_generation") should return Result.ok,
     * setting stage to "direction_generation", status to "processing",
     * and progressPercent to 65.
     *
     * On UNFIXED code: transitionTo returns Result.fail with
     * "Cannot transition from terminal status 'completed'" because the
     * terminal guard only exempts "preview", not "done".
     *
     * EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS with counterexample.
     */
    fc.assert(
      fc.property(
        jobIdArb,
        browserIdArb,
        topicArb,
        formatArb,
        themeIdArb,
        voiceIdArb,
        (id, browserId, topic, format, themeId, voiceId) => {
          const job = reconstituteDoneJob({
            id,
            browserId,
            topic,
            format,
            themeId,
            voiceId,
          });

          // Precondition: job is at done/completed
          expect(job.stage.value).toBe("done");
          expect(job.status.value).toBe("completed");

          const result = job.transitionTo("direction_generation");

          // Expected behavior: transition succeeds
          expect(result.isSuccess).toBe(true);
          expect(job.stage.value).toBe("direction_generation");
          expect(job.status.value).toBe("processing");
          expect(job.progressPercent).toBe(65);
        },
      ),
      { numRuns: 100 },
    );
  });
});
