import { PipelineError } from "./pipeline-errors.js";

describe("PipelineError", () => {
  it("should extend Error with correct name and code", () => {
    const error = new PipelineError("something broke", "rendering_failed");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PipelineError");
    expect(error.message).toBe("something broke");
    expect(error.code).toBe("rendering_failed");
  });

  describe("factory methods", () => {
    it.each([
      ["scriptGenerationFailed", "script_generation_failed"],
      ["ttsGenerationFailed", "tts_generation_failed"],
      ["transcriptionFailed", "transcription_failed"],
      ["timestampMappingFailed", "timestamp_mapping_failed"],
      ["directionGenerationFailed", "direction_generation_failed"],
      ["codeGenerationFailed", "code_generation_failed"],
      ["renderingFailed", "rendering_failed"],
    ] as const)("%s creates error with code %s", (method, expectedCode) => {
      const error = (PipelineError as any)[method]("test message");

      expect(error).toBeInstanceOf(PipelineError);
      expect(error.code).toBe(expectedCode);
      expect(error.message).toBe("test message");
      expect(error.name).toBe("PipelineError");
    });
  });

  describe("fromCode", () => {
    it("creates error from any valid PipelineErrorCode", () => {
      const error = PipelineError.fromCode(
        "timestamp_mapping_failed",
        "mapping failed",
      );

      expect(error).toBeInstanceOf(PipelineError);
      expect(error.code).toBe("timestamp_mapping_failed");
      expect(error.message).toBe("mapping failed");
    });
  });
});
