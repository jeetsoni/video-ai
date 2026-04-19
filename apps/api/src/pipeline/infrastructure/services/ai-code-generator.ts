import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
  ScenePlan,
  AnimationTheme,
  LayoutProfile,
} from "@video-ai/shared";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { FULL_PRIMITIVES } from "./remotion-primitives.js";

export interface AICodeGeneratorConfig {
  model: string;
  temperature: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: AICodeGeneratorConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.4,
  maxRetries: 2,
};

function buildSlotPixelTable(layoutProfile: LayoutProfile): string {
  const slotEntries = Object.values(layoutProfile.slots);
  if (slotEntries.length === 0) return "";

  const lines = ["## Slot-to-Pixel Coordinate Mapping", ""];
  lines.push(
    "Each beat has a `slot` field. Use this table to position content within the correct pixel region.",
  );
  lines.push("");
  lines.push(
    "| Slot ID | Label | Top (px) | Left (px) | Width (px) | Height (px) |",
  );
  lines.push(
    "|---------|-------|----------|-----------|------------|-------------|",
  );
  for (const slot of slotEntries) {
    lines.push(
      `| ${slot.id} | ${slot.label} | ${slot.bounds.top} | ${slot.bounds.left} | ${slot.bounds.width} | ${slot.bounds.height} |`,
    );
  }
  lines.push("");
  lines.push("Slot bounds are relative to the safe zone origin.");
  return lines.join("\n");
}

function buildCodeSystemPrompt(
  theme: AnimationTheme,
  layoutProfile: LayoutProfile,
): string {
  const { canvas, safeZone } = layoutProfile;
  const safeZoneBottom = safeZone.top + safeZone.height;

  return `You are a world-class Remotion motion graphics engineer. You receive a ScenePlan JSON and produce a single React component that renders RICH, PROFESSIONAL animated motion graphics for educational short-form video on ANY topic.

## Available Globals (do NOT import)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing

## Optional Helper Primitives (IN SCOPE — use when they fit, but feel free to build custom visuals)

These components are pre-defined and available. Use them when they genuinely match what the scene direction describes. If the direction calls for something more specific (a custom diagram, a unique UI, a visual metaphor), build it from scratch with divs, SVGs, and inline styles — that's preferred over forcing content into a generic primitive.

- GlassPanel({ children, glow, padding, borderRadius, style }) — container with subtle bg and border
- SceneEntry({ children, frame, duration }) — scene entry fade: scale 0.92→1 + opacity 0→1
- Stagger({ children, frame, delayPerItem, startDelay }) — staggers children entry with opacity + translateY
- TypeWriter({ text, frame, duration, fontSize, color, fontFamily, style }) — text types itself character by character
- CodeWindow({ code, title, frame, typingDuration, accentColor, style }) — terminal window with dots and optional typing
- DataTable({ headers, rows, frame, delayPerRow, startDelay, accentColor, style }) — table with row-by-row reveal
- FlowDiagram({ nodes, frame, startDelay, nodeGap, accentColor, direction, style }) — animated flow diagram
- BarChart({ bars, frame, startDelay, delayPerBar, maxHeight, barWidth, gap, style }) — animated bar chart
- CountUp({ target, frame, duration, fontSize, color, prefix, suffix, decimals, style }) — animated number counter
- Badge({ label, color, fontSize, style }) — accent badge/tag
- IconBox({ icon, size, color, style }) — icon container with tinted bg
- DrawBorder({ width, height, frame, duration, color, strokeWidth, borderRadius, style }) — SVG border that draws itself (width/height must be numeric px)

WHEN TO USE PRIMITIVES vs CUSTOM:
- Direction says "bar chart comparing X vs Y" → use BarChart
- Direction says "flow diagram: Input → Process → Output" → use FlowDiagram
- Direction says "terminal showing npm install" → use CodeWindow
- Direction says "WhatsApp-style chat with message bubbles" → BUILD IT CUSTOM with divs
- Direction says "timeline of historical events" → BUILD IT CUSTOM with SVG/divs
- Direction says "molecule diagram" → BUILD IT CUSTOM with SVG
- Direction says "split-screen comparison" → BUILD IT CUSTOM with flexbox layout

The rule: if a primitive matches the visualization 1:1, use it. If you'd have to shoehorn the content into a primitive, build it from scratch instead.

## Layout — FILL THE SAFE ZONE (critical)

Canvas: ${canvas.width}x${canvas.height}. Safe zone: CANVAS_TOP=${safeZone.top}, CANVAS_H=${safeZone.height} (y=${safeZone.top} to y=${safeZoneBottom}).
- Wrap all content: position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H
- Content MUST spread across the full ${safeZone.height}px height — not clustered at the top
- Width: elements should span 70-100% of the ${safeZone.width}px usable width

${buildSlotPixelTable(layoutProfile)}

## Layout Rules
- Each beat's content MUST be positioned within its assigned slot bounds
- Use the slot-to-pixel mapping table above to determine exact positioning for each beat

## Typography (mobile-first — always large, ADAPTIVE to content density)
- 1-2 blocks: hero titles 96-120, headlines 68-80
- 3-4 blocks: hero titles 72-88, headlines 56-64, body 32-38
- 5+ blocks: hero titles 56-68, headlines 44-52, body 30-34
- MINIMUM fontSize: 28 — never go smaller
- Monospace for code/tech: fontFamily 'monospace'

## Visual Style — Clean Enterprise Aesthetic

Background: "${theme.background}"
Text: ${theme.textPrimary} primary, ${theme.textMuted} muted

- Cards must be visibly lighter than background (use ${theme.surface}, ${theme.raised}, or tinted variants)
- Thin 1px–1.5px solid borders with color at 0.2–0.35 opacity — consistent stroke weight
- NO box-shadow, NO drop-shadow, NO glow — borders and tinted backgrounds define depth
- NO gradients on text, backgrounds, or icons — flat solid fills only
- NO glowing effects, NO 3D, NO neon, NO cartoon elements
- Maximum 3-4 colors per visual — palette restraint is professional
- Stripe / Linear / Notion enterprise aesthetic — LARGE and BOLD for mobile
- Use SVG for diagrams, charts, flow charts — NOT placeholder shapes
- Content must be SPECIFIC to the topic — real terms, real numbers, real labels — no lorem ipsum
- NEVER use <img> tags or external URLs — draw icons as inline SVG or use emoji characters

## Defensive Layout Rules
- overflow:'hidden' on fixed-size containers
- flexbox + gap for static siblings
- boxSizing:'border-box' on elements with padding + fixed size
- flexShrink:1 and minHeight:0 for vertical card stacks
- Content must start from the TOP of the safe zone — never leave the top empty
- Single main visual → center VERTICALLY with justifyContent:'center'
- Multiple elements → distribute with justifyContent:'space-between' or 'space-evenly'
- ALWAYS set the scene wrapper to height:CANVAS_H — never let it collapse

## Rules
1. function Main({ scenePlan }) — receives the full ScenePlan JSON
2. Use useCurrentFrame() and useVideoConfig() for timing
3. Use <Sequence from={frameNumber} durationInFrames={duration}> to time scenes and beats
4. Use interpolate() with extrapolateLeft:'clamp', extrapolateRight:'clamp'
5. Inline styles only — no CSS imports, no Tailwind
6. Do NOT use any imports — everything is in scope
7. Do NOT use <Audio>, <Video>, <Img>, or any media tags
8. Keep code under 600 lines — write DRY, compact code with reusable helpers
9. NO code comments — zero comments
10. Extract repeated styles AND animation helpers into shared const/functions at top
11. Add scene entry animation: scale 0.92->1 + opacity 0->1 over 12-15 frames per scene
12. Smooth spring entries: spring({ frame, fps, config: { damping:14, stiffness:180 } })
13. Subtle idle animations: Math.sin(frame * 0.04) * 3 for gentle floating on key elements

## Component Structure
function Main({ scenePlan }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CANVAS_TOP = ${safeZone.top};
  const CANVAS_H = ${safeZone.height};

  return (
    <AbsoluteFill style={{ backgroundColor:"${theme.background}" }}>
      {scenePlan.scenes.map((scene) => {
        const sf = frame - scene.startFrame;
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
            <div style={{ position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H, display:"flex", flexDirection:"column", boxSizing:"border-box" }}>
              {/* Build the actual visualization described in animationDirection.beats */}
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

## Beat Interpretation
For each beat in a scene:
- Read the visual field to decide WHAT to render — if it describes a standard chart/table/flow, use the matching primitive; if it describes something unique, build it custom
- Read the motion field for timing and animation specs
- Read the typography field for text styling and accent colors
- Use the beat's frameRange for timing within the scene
- Use the beat's slot field for pixel coordinates from the slot mapping table

## Output Format
Return ONLY the component code. No markdown fences, no explanation, no imports.
Start directly with: function Main({ scenePlan }) {`;
}

function buildCodePrompt(scenePlan: ScenePlan): string {
  return `Generate a Remotion React component for this scene plan. Create professional, clean motion graphics with:
- Clean card-based layouts with tinted backgrounds and thin borders
- Smooth spring entry animations per scene (scale 0.92->1 + opacity fade)
- Staggered element entries (8-12 frame gaps between siblings)
- Subtle idle animations on key elements (gentle floating via Math.sin)
- Build the ACTUAL visualization described in each beat — diagrams, charts, UIs, visual metaphors — not generic cards with emoji

IMPORTANT:
- Start with: function Main({ scenePlan }) {
- Use only the globals in scope (React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing)
- Pre-built primitives (GlassPanel, CodeWindow, DataTable, FlowDiagram, BarChart, etc.) are also in scope — use them when they fit, build custom when they don't
- Return ONLY the code, no markdown fences
- Extract reusable helpers at the top for DRY code

Scene Plan JSON:
${JSON.stringify(scenePlan, null, 1)}`;
}

const MAIN_EXPORT_PATTERN =
  /export\s+default\s+(?:function\s+)?Main|export\s*\{\s*Main\s+as\s+default\s*\}|function\s+Main\s*\(/;

function hasMainComponent(code: string): boolean {
  return MAIN_EXPORT_PATTERN.test(code);
}

function cleanCodeOutput(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(
    /```(?:tsx?|jsx?|typescript|javascript)?\s*\n?([\s\S]*?)\n?```/,
  );
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();
  return cleaned;
}

export class AICodeGenerator implements CodeGenerator {
  private readonly config: AICodeGeneratorConfig;

  constructor(config?: Partial<AICodeGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateCode(params: {
    scenePlan: ScenePlan;
    theme: AnimationTheme;
    layoutProfile: LayoutProfile;
  }): Promise<Result<string, PipelineError>> {
    const google = createGoogleGenerativeAI({
      apiKey: process.env["GEMINI_API_KEY"] ?? "",
    });

    const systemPrompt = buildCodeSystemPrompt(
      params.theme,
      params.layoutProfile,
    );
    const prompt = buildCodePrompt(params.scenePlan);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const retryHint =
          attempt > 0
            ? `\n\nPREVIOUS ATTEMPT FAILED: The code did not contain a "Main" function. You MUST start with: function Main({ scenePlan }) {`
            : "";

        const { text } = await generateText({
          model: google(this.config.model),
          system: systemPrompt,
          prompt: prompt + retryHint,
          temperature: this.config.temperature,
        });

        if (!text || text.trim().length === 0) continue;

        const code = cleanCodeOutput(text);

        if (hasMainComponent(code)) {
          return Result.ok(FULL_PRIMITIVES + "\n" + code);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown code generation error";

        if (attempt === this.config.maxRetries) {
          return Result.fail(
            PipelineError.codeGenerationFailed(
              `Code generation failed after ${this.config.maxRetries + 1} attempts: ${message}`,
            ),
          );
        }
      }
    }

    return Result.fail(
      PipelineError.codeGenerationFailed(
        `Generated code does not contain a "Main" component after ${this.config.maxRetries + 1} attempts`,
      ),
    );
  }
}
