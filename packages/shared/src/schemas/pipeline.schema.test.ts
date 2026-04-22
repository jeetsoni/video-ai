/**
 * Property-Based Tests for createPipelineJobSchema and voiceSettingsSchema
 *
 * Feature: comprehensive-test-coverage, Property 3/4/5/6
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 12.9, 12.10**
 */
import fc from "fast-check";
import {
  createPipelineJobSchema,
  voiceSettingsSchema,
} from "./pipeline.schema.js";

// --- Arbitraries ---

const validTopicArb = fc.string({ minLength: 3, maxLength: 500 });
const validFormatArb = fc.constantFrom("reel", "short", "longform");
const validThemeIdArb = fc.string({ minLength: 1 });

const validCreateJobInputArb = fc.record({
  topic: validTopicArb,
  format: validFormatArb,
  themeId: validThemeIdArb,
});

const shortTopicArb = fc.string({ minLength: 0, maxLength: 2 });

const invalidFormatArb = fc
  .string({ minLength: 1 })
  .filter((s) => !["reel", "short", "longform"].includes(s));

// Voice settings arbitraries
const validSpeedArb = fc.double({ min: 0.7, max: 1.2, noNaN: true, noDefaultInfinity: true });
const validStabilityArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const validSimilarityBoostArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const validStyleArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

const validVoiceSettingsArb = fc.record({
  speed: validSpeedArb,
  stability: validStabilityArb,
  similarityBoost: validSimilarityBoostArb,
  style: validStyleArb,
});

const invalidSpeedArb = fc.oneof(
  fc.double({ min: -1e6, max: 0.6999999, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 1.2000001, max: 1e6, noNaN: true, noDefaultInfinity: true }),
);

describe("Feature: comprehensive-test-coverage, Property 3: createPipelineJobSchema accepts all valid inputs", () => {
  /**
   * Property 3: For all valid inputs, createPipelineJobSchema.safeParse returns success
   * with matching data.
   *
   * **Validates: Requirements 11.1**
   */
  it("accepts all valid inputs with matching data", () => {
    fc.assert(
      fc.property(validCreateJobInputArb, (input) => {
        const result = createPipelineJobSchema.safeParse(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.topic).toBe(input.topic);
          expect(result.data.format).toBe(input.format);
          expect(result.data.themeId).toBe(input.themeId);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: comprehensive-test-coverage, Property 4: createPipelineJobSchema rejects short topics", () => {
  /**
   * Property 4: For all short topics (0–2 chars), safeParse returns failure.
   *
   * **Validates: Requirements 11.2**
   */
  it("rejects topics shorter than 3 characters", () => {
    fc.assert(
      fc.property(shortTopicArb, validFormatArb, validThemeIdArb, (topic, format, themeId) => {
        const result = createPipelineJobSchema.safeParse({ topic, format, themeId });

        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: comprehensive-test-coverage, Property 5: createPipelineJobSchema rejects invalid formats", () => {
  /**
   * Property 5: For all invalid formats, safeParse returns failure.
   *
   * **Validates: Requirements 11.3**
   */
  it("rejects formats not in the valid enum", () => {
    fc.assert(
      fc.property(validTopicArb, invalidFormatArb, validThemeIdArb, (topic, format, themeId) => {
        const result = createPipelineJobSchema.safeParse({ topic, format, themeId });

        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: comprehensive-test-coverage, Property 6: voiceSettingsSchema validation boundaries", () => {
  /**
   * Property 6a: For all valid voice settings, safeParse returns success.
   *
   * **Validates: Requirements 12.9**
   */
  it("accepts all valid voice settings within ranges", () => {
    fc.assert(
      fc.property(validVoiceSettingsArb, (settings) => {
        const result = voiceSettingsSchema.safeParse(settings);

        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 6b: For all speed values outside [0.7, 1.2], safeParse returns failure.
   *
   * **Validates: Requirements 12.10**
   */
  it("rejects speed outside 0.7–1.2 range", () => {
    fc.assert(
      fc.property(
        invalidSpeedArb,
        validStabilityArb,
        validSimilarityBoostArb,
        validStyleArb,
        (speed, stability, similarityBoost, style) => {
          const result = voiceSettingsSchema.safeParse({
            speed,
            stability,
            similarityBoost,
            style,
          });

          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
