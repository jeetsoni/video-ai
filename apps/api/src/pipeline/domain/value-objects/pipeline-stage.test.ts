import { PipelineStage } from "./pipeline-stage.js";

describe("PipelineStage", () => {
  it("creates from a valid stage string", () => {
    const stage = PipelineStage.create("script_generation");
    expect(stage).not.toBeNull();
    expect(stage!.value).toBe("script_generation");
  });

  it("returns null for an invalid stage string", () => {
    expect(PipelineStage.create("invalid_stage")).toBeNull();
  });

  it("initial() returns script_generation", () => {
    expect(PipelineStage.initial().value).toBe("script_generation");
  });

  describe("canTransitionTo", () => {
    it("allows script_generation → script_review", () => {
      const from = PipelineStage.create("script_generation")!;
      const to = PipelineStage.create("script_review")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows script_review → tts_generation (approve)", () => {
      const from = PipelineStage.create("script_review")!;
      const to = PipelineStage.create("tts_generation")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows script_review → script_generation (regenerate)", () => {
      const from = PipelineStage.create("script_review")!;
      const to = PipelineStage.create("script_generation")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows transcription → timestamp_mapping", () => {
      const from = PipelineStage.create("transcription")!;
      const to = PipelineStage.create("timestamp_mapping")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows timestamp_mapping → direction_generation", () => {
      const from = PipelineStage.create("timestamp_mapping")!;
      const to = PipelineStage.create("direction_generation")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows rendering → done", () => {
      const from = PipelineStage.create("rendering")!;
      const to = PipelineStage.create("done")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("rejects skipping stages (script_generation → tts_generation)", () => {
      const from = PipelineStage.create("script_generation")!;
      const to = PipelineStage.create("tts_generation")!;
      expect(from.canTransitionTo(to)).toBe(false);
    });

    it("rejects invalid transitions from done", () => {
      const from = PipelineStage.create("done")!;
      const to = PipelineStage.create("script_generation")!;
      expect(from.canTransitionTo(to)).toBe(false);
    });

    it("allows done → direction_generation (regenerate)", () => {
      const from = PipelineStage.create("done")!;
      const to = PipelineStage.create("direction_generation")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });

    it("allows preview → direction_generation (regenerate)", () => {
      const from = PipelineStage.create("preview")!;
      const to = PipelineStage.create("direction_generation")!;
      expect(from.canTransitionTo(to)).toBe(true);
    });
  });

  it("isReviewStage identifies review stages", () => {
    expect(PipelineStage.create("script_review")!.isReviewStage()).toBe(true);
    expect(PipelineStage.create("rendering")!.isReviewStage()).toBe(false);
  });

  it("isTerminal identifies done as terminal", () => {
    expect(PipelineStage.create("done")!.isTerminal()).toBe(true);
    expect(PipelineStage.create("rendering")!.isTerminal()).toBe(false);
  });

  it("indexOf returns correct position", () => {
    expect(PipelineStage.create("script_generation")!.indexOf()).toBe(0);
    expect(PipelineStage.create("done")!.indexOf()).toBe(9);
  });

  it("allStages returns all 9 stages", () => {
    expect(PipelineStage.allStages()).toHaveLength(10);
  });

  it("validTransitionsFrom returns allowed targets", () => {
    const transitions = PipelineStage.validTransitionsFrom("script_review");
    expect(transitions).toContain("tts_generation");
    expect(transitions).toContain("script_generation");
  });

  it("equals compares by value", () => {
    const a = PipelineStage.create("rendering")!;
    const b = PipelineStage.create("rendering")!;
    expect(a.equals(b)).toBe(true);
  });
});
