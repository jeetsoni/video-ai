export interface LayoutProfile {
  id: string;
  name: string;
  canvas: { width: number; height: number };
  safeZone: { top: number; left: number; width: number; height: number };
  slots: SlotMap;
  metadata: {
    description: string;
    reservedRegions?: ReservedRegion[];
  };
}

export interface ReservedRegion {
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Slot {
  id: string;
  label: string;
  bounds: { top: number; left: number; width: number; height: number };
  allowOverflow: boolean;
}

export type SlotMap = Record<string, Slot>;

export interface BoundingBox {
  elementId: string;
  slotId?: string;
  initial: { top: number; left: number; width: number; height: number };
  animated: { top: number; left: number; width: number; height: number };
  transforms: AnimationTransform[];
}

export interface AnimationTransform {
  property: string;
  from: number;
  to: number;
  timing: { startFrame: number; endFrame: number };
}

export interface OverlapViolation {
  elementA: string;
  elementB: string;
  overlapRegion: { top: number; left: number; width: number; height: number };
  frameRange: [number, number];
  severity: "warning" | "error";
}

export interface ValidationResult {
  valid: boolean;
  violations: OverlapViolation[];
  boundingBoxes: BoundingBox[];
  summary: string;
}
