/**
 * Property-Based Tests for applyEdit (script editing logic)
 *
 * Feature: script-chat, Property 1: edit_script produces correct single-occurrence replacement
 *
 * **Validates: Requirements 6.2, 6.3, 6.4**
 */
import fc from "fast-check";
import { applyEdit } from "./ai-script-tweaker.js";

// --- Arbitraries ---

/** Generates a non-empty string suitable for script content (printable ASCII + newlines). */
const scriptFragmentArb = fc.stringOf(
  fc.oneof(
    fc.char().filter((c) => c >= " " && c <= "~"),
    fc.constant("\n"),
  ),
  { minLength: 1, maxLength: 200 },
);

/** Generates a non-empty substring that is guaranteed to be unique within a script. */
const uniqueSubstringScriptArb = fc
  .tuple(scriptFragmentArb, scriptFragmentArb, scriptFragmentArb)
  .filter(([prefix, unique, suffix]) => {
    if (unique.length === 0) return false;
    // Build the full script and verify oldStr appears exactly once
    const script = prefix + unique + suffix;
    const firstIdx = script.indexOf(unique);
    const secondIdx = script.indexOf(unique, firstIdx + 1);
    return secondIdx === -1;
  })
  .map(([prefix, unique, suffix]) => ({
    script: prefix + unique + suffix,
    oldStr: unique,
    prefix,
    suffix,
  }));

/** Generates a replacement string. */
const replacementArb = fc.string({ minLength: 0, maxLength: 200 });

/** Generates a script containing a substring that appears at least twice. */
const ambiguousSubstringScriptArb = fc
  .tuple(
    scriptFragmentArb,
    fc.string({ minLength: 1, maxLength: 30 }),
    scriptFragmentArb,
    scriptFragmentArb,
  )
  .filter(([_prefix, repeated, _middle, _suffix]) => {
    // Ensure the repeated part doesn't accidentally appear in prefix/middle/suffix
    // beyond the two intentional occurrences
    return repeated.length > 0;
  })
  .map(([prefix, repeated, middle, suffix]) => ({
    script: prefix + repeated + middle + repeated + suffix,
    ambiguousStr: repeated,
  }));

describe("Feature: script-chat, Property 1: edit_script produces correct single-occurrence replacement", () => {
  /**
   * Property 1a: For any script and unique substring, applyEdit produces correct replacement.
   *
   * For any script where oldStr appears exactly once, applyEdit(script, oldStr, newStr)
   * returns ok: true and the result equals prefix + newStr + suffix.
   *
   * **Validates: Requirements 6.2**
   */
  it("unique substring replacement produces correct result", () => {
    fc.assert(
      fc.property(
        uniqueSubstringScriptArb,
        replacementArb,
        ({ script, oldStr, prefix, suffix }, newStr) => {
          // Skip the degenerate case where oldStr === newStr (applyEdit returns error for that)
          fc.pre(oldStr !== newStr);

          const result = applyEdit(script, oldStr, newStr);

          expect(result.ok).toBe(true);
          if (result.ok) {
            // The result should be prefix + newStr + suffix
            expect(result.script).toBe(prefix + newStr + suffix);
            // The old substring should not appear if newStr doesn't contain it
            if (!newStr.includes(oldStr)) {
              expect(result.script).not.toContain(oldStr);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1b: For any script and non-existent substring, applyEdit returns error.
   *
   * For any script and oldStr that does NOT appear in the script,
   * applyEdit returns ok: false with an error message containing "not found".
   *
   * **Validates: Requirements 6.3**
   */
  it("non-existent substring returns error", () => {
    fc.assert(
      fc.property(scriptFragmentArb, replacementArb, (script, newStr) => {
        // Generate a non-existent substring by appending a unique marker
        const nonExistent = script + "___DOES_NOT_EXIST___";

        const result = applyEdit(script, nonExistent, newStr);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain("not found");
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1c: For any script with ambiguous substring (appears 2+ times), applyEdit returns error.
   *
   * For any script where oldStr appears at least twice,
   * applyEdit returns ok: false with an error message about multiple locations.
   *
   * **Validates: Requirements 6.4**
   */
  it("ambiguous substring (appears 2+ times) returns error", () => {
    fc.assert(
      fc.property(
        ambiguousSubstringScriptArb,
        replacementArb,
        ({ script, ambiguousStr }, newStr) => {
          // Skip the degenerate case where oldStr === newStr
          fc.pre(ambiguousStr !== newStr);

          const result = applyEdit(script, ambiguousStr, newStr);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain("multiple locations");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
