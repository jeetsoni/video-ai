import type { LayoutProfile } from "../types/layout.types.js";

/**
 * Faceless profile — uses full 1080×1920 canvas with no reserved regions.
 */
export const FACELESS_PROFILE: LayoutProfile = {
  id: "faceless",
  name: "Faceless (Full Canvas)",
  canvas: { width: 1080, height: 1920 },
  safeZone: { top: 0, left: 44, width: 992, height: 1920 },
  slots: {
    "top-banner": {
      id: "top-banner",
      label: "Top Banner",
      bounds: { top: 0, left: 0, width: 992, height: 160 },
      allowOverflow: false,
    },
    "top-third": {
      id: "top-third",
      label: "Top Third",
      bounds: { top: 160, left: 0, width: 992, height: 480 },
      allowOverflow: false,
    },
    center: {
      id: "center",
      label: "Center",
      bounds: { top: 640, left: 0, width: 992, height: 640 },
      allowOverflow: false,
    },
    "bottom-third": {
      id: "bottom-third",
      label: "Bottom Third",
      bounds: { top: 1280, left: 0, width: 992, height: 480 },
      allowOverflow: false,
    },
    "bottom-banner": {
      id: "bottom-banner",
      label: "Bottom Banner",
      bounds: { top: 1760, left: 0, width: 992, height: 160 },
      allowOverflow: false,
    },
  },
  metadata: {
    description:
      "Full canvas layout for faceless videos — no reserved regions",
  },
};

/**
 * Face cam profile — reserves bottom 760px for camera overlay.
 */
export const FACECAM_PROFILE: LayoutProfile = {
  id: "facecam",
  name: "Face Cam",
  canvas: { width: 1080, height: 1920 },
  safeZone: { top: 80, left: 44, width: 992, height: 1080 },
  slots: {
    "top-third": {
      id: "top-third",
      label: "Top Third",
      bounds: { top: 0, left: 0, width: 992, height: 360 },
      allowOverflow: false,
    },
    center: {
      id: "center",
      label: "Center",
      bounds: { top: 360, left: 0, width: 992, height: 360 },
      allowOverflow: false,
    },
    "bottom-third": {
      id: "bottom-third",
      label: "Bottom Third",
      bounds: { top: 720, left: 0, width: 992, height: 360 },
      allowOverflow: false,
    },
  },
  metadata: {
    description: "Layout with bottom reserved for face cam overlay",
    reservedRegions: [
      { name: "facecam-area", top: 1160, left: 0, width: 1080, height: 760 },
    ],
  },
};

const PROFILE_REGISTRY: ReadonlyMap<string, LayoutProfile> = new Map([
  [FACELESS_PROFILE.id, FACELESS_PROFILE],
  [FACECAM_PROFILE.id, FACECAM_PROFILE],
]);

/**
 * Returns the layout profile for the given video type.
 * Falls back to the faceless profile with a console warning if the type is unrecognized.
 */
export function getLayoutProfile(videoType: string): LayoutProfile {
  const profile = PROFILE_REGISTRY.get(videoType);
  if (profile) {
    return profile;
  }

  console.warn(
    `Unknown video type "${videoType}" — falling back to faceless profile`,
  );
  return FACELESS_PROFILE;
}

/**
 * Returns all registered layout profiles.
 */
export function listLayoutProfiles(): LayoutProfile[] {
  return [...PROFILE_REGISTRY.values()];
}
