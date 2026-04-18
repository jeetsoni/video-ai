import { PipelineStatus } from "./pipeline-status.js";

describe("PipelineStatus", () => {
  it.each([
    "pending",
    "processing",
    "awaiting_script_review",
    "completed",
    "failed",
  ])("creates from valid status '%s'", (status) => {
    const result = PipelineStatus.create(status);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(status);
  });

  it("returns null for an invalid status", () => {
    expect(PipelineStatus.create("unknown")).toBeNull();
  });

  it("factory methods produce correct values", () => {
    expect(PipelineStatus.pending().value).toBe("pending");
    expect(PipelineStatus.processing().value).toBe("processing");
    expect(PipelineStatus.awaitingScriptReview().value).toBe("awaiting_script_review");
    expect(PipelineStatus.completed().value).toBe("completed");
    expect(PipelineStatus.failed().value).toBe("failed");
  });

  it("isTerminal identifies completed and failed", () => {
    expect(PipelineStatus.completed().isTerminal()).toBe(true);
    expect(PipelineStatus.failed().isTerminal()).toBe(true);
    expect(PipelineStatus.processing().isTerminal()).toBe(false);
  });

  it("isReview identifies review statuses", () => {
    expect(PipelineStatus.awaitingScriptReview().isReview()).toBe(true);
    expect(PipelineStatus.pending().isReview()).toBe(false);
  });

  it("equals compares by value", () => {
    const a = PipelineStatus.pending();
    const b = PipelineStatus.pending();
    expect(a.equals(b)).toBe(true);
    expect(a.equals(PipelineStatus.failed())).toBe(false);
  });

  it("allStatuses returns all 5 statuses", () => {
    expect(PipelineStatus.allStatuses()).toHaveLength(5);
  });
});
