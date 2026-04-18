import { validateSafeZone, validateSlotMap, validateSlotNonOverlap } from "./layout-validation.js";
import { FACELESS_PROFILE, FACECAM_PROFILE } from "./layout-profiles.js";
import type { LayoutProfile } from "../types/layout.types.js";

/** Helper to create a minimal profile with overrides. */
function makeProfile(overrides: Partial<LayoutProfile> = {}): LayoutProfile {
  return {
    id: "test",
    name: "Test",
    canvas: { width: 1080, height: 1920 },
    safeZone: { top: 0, left: 0, width: 1080, height: 1920 },
    slots: {},
    metadata: { description: "test profile" },
    ...overrides,
  };
}

describe("validateSafeZone", () => {
  it("accepts the faceless preset profile", () => {
    expect(validateSafeZone(FACELESS_PROFILE)).toBe(true);
  });

  it("accepts the facecam preset profile", () => {
    expect(validateSafeZone(FACECAM_PROFILE)).toBe(true);
  });

  it("accepts a safe zone that exactly fills the canvas", () => {
    const profile = makeProfile({
      canvas: { width: 100, height: 200 },
      safeZone: { top: 0, left: 0, width: 100, height: 200 },
    });
    expect(validateSafeZone(profile)).toBe(true);
  });

  it("rejects when safe zone exceeds canvas height", () => {
    const profile = makeProfile({
      canvas: { width: 1080, height: 1920 },
      safeZone: { top: 100, left: 0, width: 1080, height: 1920 },
    });
    expect(validateSafeZone(profile)).toBe(false);
  });

  it("rejects when safe zone exceeds canvas width", () => {
    const profile = makeProfile({
      canvas: { width: 1080, height: 1920 },
      safeZone: { top: 0, left: 100, width: 1080, height: 1920 },
    });
    expect(validateSafeZone(profile)).toBe(false);
  });
});

describe("validateSlotMap", () => {
  it("accepts the faceless preset slots", () => {
    expect(validateSlotMap(FACELESS_PROFILE)).toBe(true);
  });

  it("accepts the facecam preset slots", () => {
    expect(validateSlotMap(FACECAM_PROFILE)).toBe(true);
  });

  it("accepts an empty slot map", () => {
    const profile = makeProfile({ slots: {} });
    expect(validateSlotMap(profile)).toBe(true);
  });

  it("rejects a slot that exceeds safe zone height", () => {
    const profile = makeProfile({
      safeZone: { top: 0, left: 0, width: 500, height: 500 },
      slots: {
        big: {
          id: "big",
          label: "Big",
          bounds: { top: 0, left: 0, width: 500, height: 501 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotMap(profile)).toBe(false);
  });

  it("rejects a slot that exceeds safe zone width", () => {
    const profile = makeProfile({
      safeZone: { top: 0, left: 0, width: 500, height: 500 },
      slots: {
        wide: {
          id: "wide",
          label: "Wide",
          bounds: { top: 0, left: 100, width: 500, height: 100 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotMap(profile)).toBe(false);
  });
});

describe("validateSlotNonOverlap", () => {
  it("accepts the faceless preset slots (no overlap)", () => {
    expect(validateSlotNonOverlap(FACELESS_PROFILE)).toBe(true);
  });

  it("accepts the facecam preset slots (no overlap)", () => {
    expect(validateSlotNonOverlap(FACECAM_PROFILE)).toBe(true);
  });

  it("accepts an empty slot map", () => {
    const profile = makeProfile({ slots: {} });
    expect(validateSlotNonOverlap(profile)).toBe(true);
  });

  it("accepts a single slot", () => {
    const profile = makeProfile({
      slots: {
        only: {
          id: "only",
          label: "Only",
          bounds: { top: 0, left: 0, width: 100, height: 100 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotNonOverlap(profile)).toBe(true);
  });

  it("accepts two adjacent non-overlapping slots", () => {
    const profile = makeProfile({
      slots: {
        top: {
          id: "top",
          label: "Top",
          bounds: { top: 0, left: 0, width: 100, height: 50 },
          allowOverflow: false,
        },
        bottom: {
          id: "bottom",
          label: "Bottom",
          bounds: { top: 50, left: 0, width: 100, height: 50 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotNonOverlap(profile)).toBe(true);
  });

  it("rejects two overlapping slots", () => {
    const profile = makeProfile({
      slots: {
        a: {
          id: "a",
          label: "A",
          bounds: { top: 0, left: 0, width: 100, height: 100 },
          allowOverflow: false,
        },
        b: {
          id: "b",
          label: "B",
          bounds: { top: 50, left: 0, width: 100, height: 100 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotNonOverlap(profile)).toBe(false);
  });

  it("rejects when one slot is fully contained within another", () => {
    const profile = makeProfile({
      slots: {
        outer: {
          id: "outer",
          label: "Outer",
          bounds: { top: 0, left: 0, width: 200, height: 200 },
          allowOverflow: false,
        },
        inner: {
          id: "inner",
          label: "Inner",
          bounds: { top: 50, left: 50, width: 50, height: 50 },
          allowOverflow: false,
        },
      },
    });
    expect(validateSlotNonOverlap(profile)).toBe(false);
  });
});
