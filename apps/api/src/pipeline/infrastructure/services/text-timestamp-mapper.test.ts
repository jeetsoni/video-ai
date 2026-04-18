import { TextTimestampMapper } from "@/pipeline/infrastructure/services/text-timestamp-mapper.js";
import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";

function makeScene(overrides: Partial<SceneBoundary> = {}): SceneBoundary {
  return {
    id: 1,
    name: "Hook",
    type: "Hook",
    startTime: 0,
    endTime: 0,
    text: "Hello world",
    ...overrides,
  };
}

function makeWord(word: string, start: number, end: number): WordTimestamp {
  return { word, start, end };
}

describe("TextTimestampMapper", () => {
  let mapper: TextTimestampMapper;

  beforeEach(() => {
    mapper = new TextTimestampMapper();
  });

  describe("happy path", () => {
    it("maps 2 scenes with matching text to correct timestamps", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
        makeScene({ id: 2, name: "CTA", type: "CTA", text: "Subscribe now" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
        makeWord("Subscribe", 1.1, 1.5),
        makeWord("now", 1.6, 2.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isSuccess).toBe(true);
      const mapped = result.getValue();
      expect(mapped).toHaveLength(2);
      expect(mapped[0]!.id).toBe(1);
      expect(mapped[0]!.startTime).toBe(0.0);
      // Contiguity adjustment: scene 0 endTime = scene 1 startTime
      expect(mapped[0]!.endTime).toBe(mapped[1]!.startTime);
      expect(mapped[1]!.id).toBe(2);
      expect(mapped[1]!.endTime).toBe(2.0);
    });
  });

  describe("contiguity", () => {
    it("produces no gaps or overlaps between scene boundaries", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
        makeScene({ id: 2, name: "Body", type: "Bridge", text: "This is" }),
        makeScene({ id: 3, name: "CTA", type: "CTA", text: "Subscribe now" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
        makeWord("This", 1.2, 1.5),
        makeWord("is", 1.6, 1.8),
        makeWord("Subscribe", 2.0, 2.5),
        makeWord("now", 2.6, 3.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isSuccess).toBe(true);
      const mapped = result.getValue();

      for (let i = 0; i < mapped.length - 1; i++) {
        expect(mapped[i]!.endTime).toBe(mapped[i + 1]!.startTime);
      }
    });
  });

  describe("coverage", () => {
    it("first scene starts at or before first word, last scene ends at or after last word", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
        makeScene({ id: 2, name: "CTA", type: "CTA", text: "Subscribe now" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.1, 0.5),
        makeWord("world", 0.6, 1.0),
        makeWord("Subscribe", 1.1, 1.5),
        makeWord("now", 1.6, 2.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isSuccess).toBe(true);
      const mapped = result.getValue();

      const firstTranscriptStart = transcript[0]!.start;
      const lastTranscriptEnd = transcript[transcript.length - 1]!.end;

      expect(mapped[0]!.startTime).toBeLessThanOrEqual(firstTranscriptStart);
      expect(mapped[mapped.length - 1]!.endTime).toBeGreaterThanOrEqual(lastTranscriptEnd);
    });
  });

  describe("determinism", () => {
    it("same input produces same output when called twice", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
        makeScene({ id: 2, name: "CTA", type: "CTA", text: "Subscribe now" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
        makeWord("Subscribe", 1.1, 1.5),
        makeWord("now", 1.6, 2.0),
      ];

      const result1 = mapper.mapTimestamps({ scenes, transcript });
      const result2 = mapper.mapTimestamps({ scenes, transcript });

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(result1.getValue()).toEqual(result2.getValue());
    });
  });

  describe("error cases", () => {
    it("returns failure for empty scenes array", () => {
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
      ];

      const result = mapper.mapTimestamps({ scenes: [], transcript });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("timestamp_mapping_failed");
      expect(result.getError().message).toContain("No scenes");
    });

    it("returns failure for empty transcript", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript: [] });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("timestamp_mapping_failed");
      expect(result.getError().message).toContain("No transcript");
    });

    it("returns failure when scene word does not match transcript word", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Goodbye", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("timestamp_mapping_failed");
      expect(result.getError().message).toContain("mismatch");
    });

    it("returns failure when scene has more words than remaining transcript", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello world foo bar" }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("timestamp_mapping_failed");
      expect(result.getError().message).toContain("Ran out of transcript");
    });
  });

  describe("punctuation handling", () => {
    it("matches words with punctuation after normalization", () => {
      const scenes: SceneBoundary[] = [
        makeScene({ id: 1, name: "Hook", type: "Hook", text: "Hello, world!" }),
        makeScene({ id: 2, name: "CTA", type: "CTA", text: "Subscribe now." }),
      ];
      const transcript: WordTimestamp[] = [
        makeWord("Hello", 0.0, 0.5),
        makeWord("world", 0.6, 1.0),
        makeWord("Subscribe", 1.1, 1.5),
        makeWord("now", 1.6, 2.0),
      ];

      const result = mapper.mapTimestamps({ scenes, transcript });

      expect(result.isSuccess).toBe(true);
      const mapped = result.getValue();
      expect(mapped).toHaveLength(2);
      expect(mapped[0]!.text).toBe("Hello, world!");
      expect(mapped[1]!.text).toBe("Subscribe now.");
    });
  });
});
