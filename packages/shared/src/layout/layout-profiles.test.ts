import { jest } from "@jest/globals";
import { FACELESS_PROFILE, FACECAM_PROFILE, getLayoutProfile, listLayoutProfiles } from "./layout-profiles.js";

describe("Layout Profile Presets", () => {
  describe("FACELESS_PROFILE", () => {
    it("has correct id and name", () => {
      expect(FACELESS_PROFILE.id).toBe("faceless");
      expect(FACELESS_PROFILE.name).toBe("Faceless (Full Canvas)");
    });

    it("has 1080x1920 canvas", () => {
      expect(FACELESS_PROFILE.canvas).toEqual({ width: 1080, height: 1920 });
    });

    it("has full-height safe zone with 44px left padding", () => {
      expect(FACELESS_PROFILE.safeZone).toEqual({
        top: 0,
        left: 44,
        width: 992,
        height: 1920,
      });
    });

    it("defines five slots", () => {
      const slotIds = Object.keys(FACELESS_PROFILE.slots);
      expect(slotIds).toEqual([
        "top-banner",
        "top-third",
        "center",
        "bottom-third",
        "bottom-banner",
      ]);
    });

    it("has no reserved regions", () => {
      expect(FACELESS_PROFILE.metadata.reservedRegions).toBeUndefined();
    });
  });

  describe("FACECAM_PROFILE", () => {
    it("has correct id and name", () => {
      expect(FACECAM_PROFILE.id).toBe("facecam");
      expect(FACECAM_PROFILE.name).toBe("Face Cam");
    });

    it("has 1080x1920 canvas", () => {
      expect(FACECAM_PROFILE.canvas).toEqual({ width: 1080, height: 1920 });
    });

    it("has safe zone starting at top 80 with height 1080", () => {
      expect(FACECAM_PROFILE.safeZone).toEqual({
        top: 80,
        left: 44,
        width: 992,
        height: 1080,
      });
    });

    it("defines three slots", () => {
      const slotIds = Object.keys(FACECAM_PROFILE.slots);
      expect(slotIds).toEqual(["top-third", "center", "bottom-third"]);
    });

    it("has a facecam-area reserved region", () => {
      expect(FACECAM_PROFILE.metadata.reservedRegions).toEqual([
        { name: "facecam-area", top: 1160, left: 0, width: 1080, height: 760 },
      ]);
    });
  });
});

describe("getLayoutProfile", () => {
  it("returns faceless profile for 'faceless'", () => {
    expect(getLayoutProfile("faceless")).toBe(FACELESS_PROFILE);
  });

  it("returns facecam profile for 'facecam'", () => {
    expect(getLayoutProfile("facecam")).toBe(FACECAM_PROFILE);
  });

  it("falls back to faceless for unknown video type and logs warning", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const profile = getLayoutProfile("unknown-type");

    expect(profile).toBe(FACELESS_PROFILE);
    expect(warnSpy).toHaveBeenCalledWith(
      'Unknown video type "unknown-type" — falling back to faceless profile',
    );

    warnSpy.mockRestore();
  });
});

describe("listLayoutProfiles", () => {
  it("returns all registered profiles", () => {
    const profiles = listLayoutProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles).toContain(FACELESS_PROFILE);
    expect(profiles).toContain(FACECAM_PROFILE);
  });
});
