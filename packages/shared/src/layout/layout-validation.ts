import type { LayoutProfile } from "../types/layout.types.js";

/**
 * Returns true if the safe zone fits entirely within the canvas bounds.
 */
export function validateSafeZone(profile: LayoutProfile): boolean {
  const { canvas, safeZone } = profile;
  return (
    safeZone.top + safeZone.height <= canvas.height &&
    safeZone.left + safeZone.width <= canvas.width
  );
}

/**
 * Returns true if all slots in the SlotMap fit within the safe zone dimensions.
 * Slot bounds are relative to the safe zone origin.
 */
export function validateSlotMap(profile: LayoutProfile): boolean {
  const { safeZone, slots } = profile;
  for (const slot of Object.values(slots)) {
    if (
      slot.bounds.top + slot.bounds.height > safeZone.height ||
      slot.bounds.left + slot.bounds.width > safeZone.width
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if no two slots in the SlotMap overlap.
 * Two rectangles overlap when:
 *   rectA.left < rectB.left + rectB.width AND
 *   rectA.left + rectA.width > rectB.left AND
 *   rectA.top < rectB.top + rectB.height AND
 *   rectA.top + rectA.height > rectB.top
 */
export function validateSlotNonOverlap(profile: LayoutProfile): boolean {
  const slotList = Object.values(profile.slots);
  for (let i = 0; i < slotList.length; i++) {
    for (let j = i + 1; j < slotList.length; j++) {
      const slotA = slotList[i];
      const slotB = slotList[j];
      if (!slotA || !slotB) continue;
      const a = slotA.bounds;
      const b = slotB.bounds;
      const overlaps =
        a.left < b.left + b.width &&
        a.left + a.width > b.left &&
        a.top < b.top + b.height &&
        a.top + a.height > b.top;
      if (overlaps) {
        return false;
      }
    }
  }
  return true;
}
