import type {
  LayoutProfile,
  ScenePlan,
  ValidationResult,
  BoundingBox,
  AnimationTransform,
  OverlapViolation,
} from "@video-ai/shared";
import type { LayoutValidator } from "@/pipeline/application/interfaces/layout-validator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ParsedElement {
  id: string;
  sequenceFrom: number;
  sequenceDuration: number;
  style: Rect;
  transforms: AnimationTransform[];
}

export function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

export function computeOverlapArea(a: Rect, b: Rect): number {
  const overlapLeft = Math.max(a.left, b.left);
  const overlapTop = Math.max(a.top, b.top);
  const overlapRight = Math.min(a.left + a.width, b.left + b.width);
  const overlapBottom = Math.min(a.top + a.height, b.top + b.height);

  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);

  return overlapWidth * overlapHeight;
}

export function computeOverlapRegion(a: Rect, b: Rect): Rect {
  const overlapLeft = Math.max(a.left, b.left);
  const overlapTop = Math.max(a.top, b.top);
  const overlapRight = Math.min(a.left + a.width, b.left + b.width);
  const overlapBottom = Math.min(a.top + a.height, b.top + b.height);

  return {
    top: overlapTop,
    left: overlapLeft,
    width: Math.max(0, overlapRight - overlapLeft),
    height: Math.max(0, overlapBottom - overlapTop),
  };
}

export function classifyOverlapSeverity(
  overlapArea: number,
  rectA: Rect,
  rectB: Rect
): "warning" | "error" {
  const areaA = rectA.width * rectA.height;
  const areaB = rectB.width * rectB.height;
  const smallerArea = Math.min(areaA, areaB);

  if (smallerArea <= 0) return "error";

  const ratio = overlapArea / smallerArea;
  return ratio < 0.1 ? "warning" : "error";
}

export function applyTransforms(initial: Rect, transforms: AnimationTransform[]): Rect {
  let top = initial.top;
  let left = initial.left;
  let width = initial.width;
  let height = initial.height;

  for (const t of transforms) {
    const toValue = Number.isFinite(t.to) ? t.to : 0;

    switch (t.property) {
      case "translateY":
        top += toValue;
        break;
      case "translateX":
        left += toValue;
        break;
      case "scale": {
        const scaleFactor = toValue === 0 ? 1 : toValue;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        width *= scaleFactor;
        height *= scaleFactor;
        left = centerX - width / 2;
        top = centerY - height / 2;
        break;
      }
    }
  }

  return {
    top: Number.isFinite(top) ? top : initial.top,
    left: Number.isFinite(left) ? left : initial.left,
    width: Number.isFinite(width) ? Math.abs(width) : initial.width,
    height: Number.isFinite(height) ? Math.abs(height) : initial.height,
  };
}

export function isOutOfBounds(rect: Rect, safeZone: Rect): boolean {
  return (
    rect.top < safeZone.top ||
    rect.left < safeZone.left ||
    rect.top + rect.height > safeZone.top + safeZone.height ||
    rect.left + rect.width > safeZone.left + safeZone.width
  );
}

function extractNumber(str: string): number | null {
  const match = str.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function extractStyleValue(block: string, prop: string): number | null {
  const patterns = [
    new RegExp(`${prop}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"),
    new RegExp(`["']${prop}["']\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return parseFloat(match[1]);
  }
  return null;
}

function extractInterpolateTransforms(block: string): AnimationTransform[] {
  const transforms: AnimationTransform[] = [];

  const interpolateRegex =
    /interpolate\s*\(\s*\w+\s*,\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;

  let match: RegExpExecArray | null;
  while ((match = interpolateRegex.exec(block)) !== null) {
    const startFrame = parseFloat(match[1]);
    const endFrame = parseFloat(match[2]);
    const fromValue = parseFloat(match[3]);
    const toValue = parseFloat(match[4]);

    const contextBefore = block.slice(Math.max(0, match.index - 120), match.index);

    let property = "translateY";
    if (/translateX\s*[:(]\s*$/.test(contextBefore) || /translateX\s*\(\s*$/.test(contextBefore)) {
      property = "translateX";
    } else if (/translateY\s*[:(]\s*$/.test(contextBefore) || /translateY\s*\(\s*$/.test(contextBefore)) {
      property = "translateY";
    } else if (/scale\s*[:(]\s*$/.test(contextBefore) || /scale\s*\(\s*$/.test(contextBefore)) {
      property = "scale";
    } else if (/opacity\s*[:(]?\s*$/.test(contextBefore)) {
      property = "opacity";
    }

    if (property !== "opacity") {
      transforms.push({
        property,
        from: fromValue,
        to: toValue,
        timing: { startFrame, endFrame },
      });
    }
  }

  return transforms;
}

function extractSpringTransforms(block: string): AnimationTransform[] {
  const transforms: AnimationTransform[] = [];

  const springContextRegex =
    /(translateY|translateX|scale)\s*[:(]\s*[^)]*spring\s*\(\s*\{[^}]*\}\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = springContextRegex.exec(block)) !== null) {
    const property = match[1];
    transforms.push({
      property,
      from: 0,
      to: property === "scale" ? 1 : 0,
      timing: { startFrame: 0, endFrame: 30 },
    });
  }

  return transforms;
}

function parseSequenceBlocks(code: string): Array<{ from: number; duration: number; content: string }> {
  const blocks: Array<{ from: number; duration: number; content: string }> = [];

  const sequenceRegex =
    /<Sequence[^>]*\bfrom\s*=\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?[^>]*\bdurationInFrames\s*=\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?[^>]*>/g;

  const altSequenceRegex =
    /<Sequence[^>]*\bdurationInFrames\s*=\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?[^>]*\bfrom\s*=\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?[^>]*>/g;

  let match: RegExpExecArray | null;
  while ((match = sequenceRegex.exec(code)) !== null) {
    const from = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const startIdx = match.index + match[0].length;
    const endIdx = findClosingTag(code, startIdx, "Sequence");
    blocks.push({ from, duration, content: code.slice(startIdx, endIdx) });
  }

  while ((match = altSequenceRegex.exec(code)) !== null) {
    const duration = parseFloat(match[1]);
    const from = parseFloat(match[2]);
    const startIdx = match.index + match[0].length;
    const alreadyFound = blocks.some(
      (b) => b.from === from && b.duration === duration
    );
    if (!alreadyFound) {
      const endIdx = findClosingTag(code, startIdx, "Sequence");
      blocks.push({ from, duration, content: code.slice(startIdx, endIdx) });
    }
  }

  return blocks;
}

function findClosingTag(code: string, startIdx: number, tagName: string): number {
  let depth = 1;
  let i = startIdx;
  const openPattern = new RegExp(`<${tagName}[\\s>]`);
  const closePattern = new RegExp(`</${tagName}>`);
  const selfClosePattern = new RegExp(`<${tagName}[^>]*/>`);

  while (i < code.length && depth > 0) {
    const remaining = code.slice(i);
    const openMatch = remaining.match(openPattern);
    const closeMatch = remaining.match(closePattern);
    const selfCloseMatch = remaining.match(selfClosePattern);

    const openIdx = openMatch?.index ?? Infinity;
    const closeIdx = closeMatch?.index ?? Infinity;
    const selfCloseIdx = selfCloseMatch?.index ?? Infinity;

    const minIdx = Math.min(openIdx, closeIdx, selfCloseIdx);
    if (minIdx === Infinity) break;

    if (minIdx === closeIdx) {
      depth--;
      i += closeIdx + `</${tagName}>`.length;
    } else if (minIdx === selfCloseIdx) {
      i += selfCloseIdx + (selfCloseMatch?.[0]?.length ?? 1);
    } else {
      depth++;
      i += openIdx + (openMatch?.[0]?.length ?? 1);
    }
  }

  return i;
}

function extractStyledElements(block: string, sequenceFrom: number, sequenceDuration: number): ParsedElement[] {
  const elements: ParsedElement[] = [];

  const styleRegex =
    /style\s*=\s*\{\s*\{([^}]*position\s*:\s*["']absolute["'][^}]*)\}\s*\}/g;

  let match: RegExpExecArray | null;
  let elementIndex = 0;

  while ((match = styleRegex.exec(block)) !== null) {
    const styleBlock = match[1];

    const top = extractStyleValue(styleBlock, "top");
    const left = extractStyleValue(styleBlock, "left");
    const width = extractStyleValue(styleBlock, "width");
    const height = extractStyleValue(styleBlock, "height");

    if (top !== null && left !== null && width !== null && height !== null) {
      const contextAround = block.slice(
        Math.max(0, match.index - 200),
        Math.min(block.length, match.index + match[0].length + 500)
      );

      const interpolateTransforms = extractInterpolateTransforms(contextAround);
      const springTransforms = extractSpringTransforms(contextAround);
      const allTransforms = [...interpolateTransforms, ...springTransforms];

      elements.push({
        id: `element-${sequenceFrom}-${elementIndex}`,
        sequenceFrom,
        sequenceDuration,
        style: { top, left, width, height },
        transforms: allTransforms,
      });
      elementIndex++;
    }
  }

  return elements;
}

function buildBoundingBoxes(elements: ParsedElement[]): BoundingBox[] {
  return elements.map((el) => {
    const animated = applyTransforms(el.style, el.transforms);
    return {
      elementId: el.id,
      initial: { ...el.style },
      animated,
      transforms: el.transforms,
    };
  });
}

function detectOverlaps(
  boundingBoxes: BoundingBox[],
  sequenceGroups: Map<number, BoundingBox[]>
): OverlapViolation[] {
  const violations: OverlapViolation[] = [];

  for (const [_seqFrom, group] of sequenceGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        if (rectanglesOverlap(a.animated, b.animated)) {
          const overlapArea = computeOverlapArea(a.animated, b.animated);
          if (overlapArea > 0) {
            const overlapRegion = computeOverlapRegion(a.animated, b.animated);
            const severity = classifyOverlapSeverity(overlapArea, a.animated, b.animated);

            violations.push({
              elementA: a.elementId,
              elementB: b.elementId,
              overlapRegion,
              frameRange: [0, 0],
              severity,
            });
          }
        }
      }
    }
  }

  return violations;
}

function detectOutOfBounds(
  boundingBoxes: BoundingBox[],
  safeZone: Rect
): OverlapViolation[] {
  const violations: OverlapViolation[] = [];

  for (const box of boundingBoxes) {
    if (isOutOfBounds(box.animated, safeZone)) {
      const clampedTop = Math.max(box.animated.top, safeZone.top);
      const clampedLeft = Math.max(box.animated.left, safeZone.left);
      const clampedBottom = Math.min(
        box.animated.top + box.animated.height,
        safeZone.top + safeZone.height
      );
      const clampedRight = Math.min(
        box.animated.left + box.animated.width,
        safeZone.left + safeZone.width
      );

      violations.push({
        elementA: box.elementId,
        elementB: "safe-zone-boundary",
        overlapRegion: {
          top: clampedTop,
          left: clampedLeft,
          width: Math.max(0, clampedRight - clampedLeft),
          height: Math.max(0, clampedBottom - clampedTop),
        },
        frameRange: [0, 0],
        severity: "error",
      });
    }
  }

  return violations;
}

function buildSummary(violations: OverlapViolation[]): string {
  if (violations.length === 0) {
    return "All elements are within bounds and no overlaps detected.";
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const oobViolations = violations.filter((v) => v.elementB === "safe-zone-boundary");
  const overlapViolations = violations.filter((v) => v.elementB !== "safe-zone-boundary");

  const parts: string[] = [];

  if (overlapViolations.length > 0) {
    parts.push(
      `${overlapViolations.length} overlap violation(s) detected between sibling elements.`
    );
  }

  if (oobViolations.length > 0) {
    parts.push(
      `${oobViolations.length} element(s) positioned outside the safe zone.`
    );
  }

  if (errors.length > 0) {
    parts.push(`${errors.length} error(s) requiring correction.`);
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) with minor overlap.`);
  }

  for (const v of violations) {
    if (v.elementB === "safe-zone-boundary") {
      parts.push(
        `- ${v.elementA} extends outside the safe zone.`
      );
    } else {
      parts.push(
        `- ${v.elementA} and ${v.elementB} overlap (${v.severity}).`
      );
    }
  }

  return parts.join(" ");
}

export class BoundingBoxValidator implements LayoutValidator {
  async validate(params: {
    code: string;
    layoutProfile: LayoutProfile;
    scenePlan: ScenePlan;
  }): Promise<Result<ValidationResult, PipelineError>> {
    try {
      const { code, layoutProfile } = params;
      const safeZone = layoutProfile.safeZone;

      const sequenceBlocks = parseSequenceBlocks(code);

      const allElements: ParsedElement[] = [];
      for (const block of sequenceBlocks) {
        const elements = extractStyledElements(block.content, block.from, block.duration);
        allElements.push(...elements);
      }

      if (allElements.length === 0) {
        const result: ValidationResult = {
          valid: true,
          violations: [],
          boundingBoxes: [],
          summary: "No absolutely-positioned elements found to validate.",
        };
        return Result.ok(result);
      }

      const boundingBoxes = buildBoundingBoxes(allElements);

      const sequenceGroups = new Map<number, BoundingBox[]>();
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const box = boundingBoxes[i];
        const group = sequenceGroups.get(el.sequenceFrom) ?? [];
        group.push(box);
        sequenceGroups.set(el.sequenceFrom, group);
      }

      const overlapViolations = detectOverlaps(boundingBoxes, sequenceGroups);
      const oobViolations = detectOutOfBounds(boundingBoxes, safeZone);
      const allViolations = [...overlapViolations, ...oobViolations];

      const hasErrors = allViolations.some((v) => v.severity === "error");

      const validationResult: ValidationResult = {
        valid: !hasErrors,
        violations: allViolations,
        boundingBoxes,
        summary: buildSummary(allViolations),
      };

      return Result.ok(validationResult);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown validation error";
      return Result.fail(
        PipelineError.codeGenerationFailed(`Layout validation failed: ${message}`)
      );
    }
  }
}
