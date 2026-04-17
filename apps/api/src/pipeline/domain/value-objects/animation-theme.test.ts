import { AnimationThemeId } from "./animation-theme.js";

describe("AnimationThemeId", () => {
  it("creates from a valid non-empty string", () => {
    const result = AnimationThemeId.create("studio");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().value).toBe("studio");
  });

  it("trims whitespace", () => {
    const result = AnimationThemeId.create("  neon  ");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().value).toBe("neon");
  });

  it("rejects an empty string", () => {
    const result = AnimationThemeId.create("");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_THEME_ID");
  });

  it("rejects a whitespace-only string", () => {
    const result = AnimationThemeId.create("   ");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_THEME_ID");
  });

  it("equals another AnimationThemeId with the same value", () => {
    const a = AnimationThemeId.create("ocean").getValue();
    const b = AnimationThemeId.create("ocean").getValue();
    expect(a.equals(b)).toBe(true);
  });

  it("does not equal a different AnimationThemeId", () => {
    const a = AnimationThemeId.create("ocean").getValue();
    const b = AnimationThemeId.create("neon").getValue();
    expect(a.equals(b)).toBe(false);
  });

  it("toString returns the ID string", () => {
    const id = AnimationThemeId.create("daylight").getValue();
    expect(id.toString()).toBe("daylight");
  });
});
