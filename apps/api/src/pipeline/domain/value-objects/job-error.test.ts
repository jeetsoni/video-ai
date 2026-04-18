import { JobError } from "./job-error.js";

describe("JobError", () => {
  it.each([
    "script_generation_failed",
    "tts_generation_failed",
    "transcription_failed",
    "timestamp_mapping_failed",
    "direction_generation_failed",
    "code_generation_failed",
    "rendering_failed",
  ])("creates with valid error code '%s'", (code) => {
    const result = JobError.create(code, "Something went wrong");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().code).toBe(code);
    expect(result.getValue().message).toBe("Something went wrong");
  });

  it("rejects an invalid error code", () => {
    const result = JobError.create("unknown_error", "msg");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_ERROR_CODE");
  });

  it("rejects an empty message", () => {
    const result = JobError.create("rendering_failed", "");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_ERROR_MESSAGE");
  });

  it("rejects a whitespace-only message", () => {
    const result = JobError.create("rendering_failed", "   ");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_ERROR_MESSAGE");
  });

  it("trims the message", () => {
    const result = JobError.create("rendering_failed", "  error detail  ");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().message).toBe("error detail");
  });

  it("equals another JobError with same code and message", () => {
    const a = JobError.create("rendering_failed", "err").getValue();
    const b = JobError.create("rendering_failed", "err").getValue();
    expect(a.equals(b)).toBe(true);
  });

  it("does not equal a JobError with different code", () => {
    const a = JobError.create("rendering_failed", "err").getValue();
    const b = JobError.create("tts_generation_failed", "err").getValue();
    expect(a.equals(b)).toBe(false);
  });

  it("toString formats as [code] message", () => {
    const err = JobError.create("rendering_failed", "timeout").getValue();
    expect(err.toString()).toBe("[rendering_failed] timeout");
  });
});
