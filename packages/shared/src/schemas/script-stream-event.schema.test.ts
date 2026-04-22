/**
 * Property-Based Tests for ScriptStreamEvent JSON round-trip
 *
 * Feature: comprehensive-test-coverage, Property 1: ScriptStreamEvent JSON round-trip preserves data
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */
import fc from "fast-check";
import { scriptStreamEventSchema } from "./script-stream-event.schema.js";

// --- Arbitraries ---

const sceneTypeArb = fc.constantFrom(
  "Hook",
  "Analogy",
  "Bridge",
  "Architecture",
  "Spotlight",
  "Comparison",
  "Power",
  "CTA",
);

const sceneBlockArb = fc.record({
  id: fc.double({ min: -1e10, max: 1e10, noNaN: true, noDefaultInfinity: true }),
  name: fc.string(),
  type: sceneTypeArb,
  text: fc.string({ minLength: 1 }),
});

const chunkEventArb = fc.record({
  type: fc.constant("chunk" as const),
  seq: fc.nat(),
  data: fc.record({ text: fc.string() }),
});

const statusEventArb = fc.record({
  type: fc.constant("status" as const),
  seq: fc.nat(),
  data: fc.record({ message: fc.string() }),
});

const sceneEventArb = fc.record({
  type: fc.constant("scene" as const),
  seq: fc.nat(),
  data: sceneBlockArb,
});

const doneEventArb = fc.record({
  type: fc.constant("done" as const),
  seq: fc.nat(),
  data: fc.record({
    script: fc.string(),
    scenes: fc.array(sceneBlockArb, { minLength: 0, maxLength: 5 }),
  }),
});

const errorEventArb = fc.record({
  type: fc.constant("error" as const),
  seq: fc.nat(),
  data: fc.record({ code: fc.string(), message: fc.string() }),
});

const scriptStreamEventArb = fc.oneof(
  chunkEventArb,
  statusEventArb,
  sceneEventArb,
  doneEventArb,
  errorEventArb,
);

describe("Feature: comprehensive-test-coverage, Property 1: ScriptStreamEvent JSON round-trip preserves data", () => {
  /**
   * Property 1a: For all generated events, JSON.stringify → JSON.parse → scriptStreamEventSchema.parse
   * produces a deeply equal object.
   *
   * **Validates: Requirements 9.1**
   */
  it("round-trip through JSON serialization preserves data", () => {
    fc.assert(
      fc.property(scriptStreamEventArb, (event) => {
        const json = JSON.stringify(event);
        const parsed = JSON.parse(json);
        const result = scriptStreamEventSchema.parse(parsed);

        expect(result).toEqual(event);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1b: For all generated events, JSON.stringify produces valid JSON parseable by JSON.parse.
   *
   * **Validates: Requirements 9.2**
   */
  it("JSON.stringify produces valid JSON parseable by JSON.parse", () => {
    fc.assert(
      fc.property(scriptStreamEventArb, (event) => {
        const json = JSON.stringify(event);

        expect(typeof json).toBe("string");
        expect(() => JSON.parse(json)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1c: For all generated events, the type discriminator is preserved through round-trip.
   *
   * **Validates: Requirements 9.3**
   */
  it("type discriminator is preserved through round-trip", () => {
    fc.assert(
      fc.property(scriptStreamEventArb, (event) => {
        const json = JSON.stringify(event);
        const parsed = JSON.parse(json);
        const result = scriptStreamEventSchema.parse(parsed);

        expect(result.type).toBe(event.type);
      }),
      { numRuns: 100 },
    );
  });
});
