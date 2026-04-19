import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ScenePlan, AnimationTheme, LayoutProfile } from "@video-ai/shared";
import type { CodeGenerator } from "@/pipeline/application/interfaces/code-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AICodeGeneratorConfig {
  model: string;
  temperature: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: AICodeGeneratorConfig = {
  model: "gemini-3.1-pro-preview",
  temperature: 0.4,
  maxRetries: 2,
};

function buildSlotPixelTable(layoutProfile: LayoutProfile): string {
  const slotEntries = Object.values(layoutProfile.slots);
  if (slotEntries.length === 0) return "";

  const lines = ["## Slot-to-Pixel Coordinate Mapping", ""];
  lines.push("Each beat has a `slot` field. Use this table to position content within the correct pixel region.");
  lines.push("");
  lines.push("| Slot ID | Label | Top (px) | Left (px) | Width (px) | Height (px) |");
  lines.push("|---------|-------|----------|-----------|------------|-------------|");
  for (const slot of slotEntries) {
    lines.push(
      `| ${slot.id} | ${slot.label} | ${slot.bounds.top} | ${slot.bounds.left} | ${slot.bounds.width} | ${slot.bounds.height} |`
    );
  }
  lines.push("");
  lines.push("Slot bounds are relative to the safe zone origin.");
  return lines.join("\n");
}

function buildCodeSystemPrompt(theme: AnimationTheme, layoutProfile: LayoutProfile): string {
  const { canvas, safeZone } = layoutProfile;
  const safeZoneBottom = safeZone.top + safeZone.height;

  return `You are a world-class Remotion cinematic motion graphics engineer who creates ByteMonk-quality animated explainer videos. You produce STUNNING, CINEMATIC animations with neon glows, glass morphism, animated gradient borders, and progressive element construction.

## Available Globals (do NOT import)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing

## Layout — FILL THE SAFE ZONE (critical)

Canvas: ${canvas.width}x${canvas.height}. Safe zone: CANVAS_TOP=${safeZone.top}, CANVAS_H=${safeZone.height} (y=${safeZone.top} to y=${safeZoneBottom}).
- Wrap all content: position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H
- Content MUST spread across the full ${safeZone.height}px height — not clustered at the top
- Width: elements should span 70-100% of the ${safeZone.width}px usable width

${buildSlotPixelTable(layoutProfile)}

## Layout Rules
- Each beat's content MUST be positioned within its assigned slot bounds
- Animated transforms (translateY, translateX, scale) MUST NOT push content outside slot bounds
- Use the slot-to-pixel mapping table above to determine exact positioning for each beat

## Typography (mobile-first — always large, ADAPTIVE to content density)
- 1-2 blocks: hero titles 96-120, headlines 68-80
- 3-4 blocks: hero titles 72-88, headlines 56-64, body 32-38
- 5+ blocks: hero titles 56-68, headlines 44-52, body 30-34
- MINIMUM fontSize: 28 — never go smaller
- Section headers: uppercase, letterSpacing 3-6, fontSize 24-32, color ${theme.textMuted}
- Monospace for code/tech: fontFamily 'monospace'

## CINEMATIC VISUAL STYLE — Neon Glass Aesthetic

### Background & Atmosphere
- Background: "${theme.background}"
- ALWAYS render an ambient glow div: position absolute, bottom 0, centered, width 80%, height 60%, background radial-gradient(ellipse at center bottom, rgba(139,92,246,0.18) 0%, transparent 70%), pointerEvents none
- Text: ${theme.textPrimary} primary, ${theme.textMuted} muted

### Glass Panel Containers (use for ALL content panels)
- Background: rgba(255,255,255,0.04) to rgba(255,255,255,0.07)
- Border: 1px solid rgba(255,255,255,0.08-0.12)
- BorderRadius: 16-20px
- Subtle glow: boxShadow "0 0 30px rgba(R,G,B,0.12), 0 0 60px rgba(R,G,B,0.06)" using scene accent color

### Animated Rainbow Gradient Border (use on 1-2 key panels per scene)
\`\`\`
const borderAngle = (localFrame * 2) % 360;
<div style={{ padding:2, borderRadius:20, background:'conic-gradient(from '+borderAngle+'deg, #ff00ff, #ffff00, #00ff00, #00ffff, #0066ff, #ff00ff)' }}>
  <div style={{ background:'rgba(15,15,25,0.95)', borderRadius:18, padding:32 }}>
    {content}
  </div>
</div>
\`\`\`

### Neon Glow on Accent Elements
- Badges/tags: background accent at 0.15 opacity, border accent at 0.4, boxShadow "0 0 12px rgba(ACCENT,0.3)"
- Active rows: left border 3px solid accent, background accent at 0.05
- Important icons: filter "drop-shadow(0 0 6px ACCENT)"

### Progressive Construction Animations (CRITICAL — elements MUST build themselves)

1. BORDER DRAW: SVG rect with stroke-dasharray=perimeter, stroke-dashoffset animating from perimeter to 0
   const perim = 2*(w+h); const draw = interpolate(f, [0,30], [perim,0], clamp);

2. ROW-BY-ROW TABLE: Each row staggers in (8-12 frames apart) with opacity + horizontal highlight sweep
   const rowOp = interpolate(f, [i*10, i*10+12], [0,1], clamp);
   const sweep = interpolate(f, [i*10, i*10+20], [-100,100], clamp);

3. FLOW DIAGRAM: Nodes scale-spring in → SVG lines draw with dashoffset → labels fade in (each stage 15 frames after previous)

4. CODE TYPING: const chars = Math.floor(interpolate(f,[0,dur],[0,code.length],clamp));
   const cursor = Math.sin(frame*0.15)>0 ? '|' : '';
   Show code.slice(0,chars)+cursor in monospace with syntax-colored spans

5. BAR CHART: Bars grow from height 0 with staggered spring
6. NUMBER COUNT-UP: interpolate to target, Math.round() for display

### Terminal / Code Window Style
- macOS dots: 3 circles (12px) — #FF5F57, #FEBC2E, #28C840
- Dark bg: rgba(0,0,0,0.6), border rgba(255,255,255,0.08), borderRadius 12
- Title bar with filename in muted text
- Syntax highlighting: keywords in accent colors

### Connection Lines Between Elements
- SVG line/path with stroke-dasharray + animated stroke-dashoffset for draw effect
- Dashed lines with dashOffset = frame*0.5 for flowing data effect
- Arrow heads: small triangles appearing after line draws
- Labels fade in after line completes

## Defensive Layout Rules
- overflow:'hidden' on fixed-size containers
- flexbox + gap for static siblings
- boxSizing:'border-box' on elements with padding + fixed size
- flexShrink:1 and minHeight:0 for vertical card stacks
- NEVER leave the top portion of the safe zone empty — content must start from the TOP of the safe zone
- If a scene has a single main visual, center it VERTICALLY within the full safe zone height using justifyContent:'center'
- If a scene has multiple elements, distribute them with justifyContent:'space-between' or 'space-evenly'
- ALWAYS set the scene wrapper to height:CANVAS_H — never let it collapse
- Test: if more than 30% of the safe zone is empty white/dark space with no content, the layout is WRONG

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
11. ALWAYS add cinematic scene entry: scale 0.92->1 + opacity 0->1 over 15 frames
12. ALWAYS render ambient purple glow at canvas bottom
13. Every scene must have at least one element with subtle idle animation (glow pulse via Math.sin, gradient rotation)

## Reusable Helper Pattern (define at top of Main)
const clamp = { extrapolateLeft:'clamp', extrapolateRight:'clamp' };
const glass = (glow) => ({ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, boxShadow:glow?'0 0 30px rgba('+glow+',0.15)':'none' });
const stagger = (i, base, gap=10) => base + i*gap;

## Component Structure
function Main({ scenePlan }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CANVAS_TOP = ${safeZone.top};
  const CANVAS_H = ${safeZone.height};
  const clamp = { extrapolateLeft:'clamp', extrapolateRight:'clamp' };

  return (
    <AbsoluteFill style={{ backgroundColor:"${theme.background}" }}>
      <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:'80%', height:'60%', background:'radial-gradient(ellipse at center bottom, rgba(139,92,246,0.18) 0%, transparent 70%)', pointerEvents:'none' }} />
      {scenePlan.scenes.map((scene) => {
        const sf = frame - scene.startFrame;
        const entry = interpolate(sf, [0,15], [0,1], clamp);
        const sc = interpolate(sf, [0,15], [0.92,1], clamp);
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
            <div style={{ position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H, display:"flex", flexDirection:"column", boxSizing:"border-box", opacity:entry, transform:'scale('+sc+')', transformOrigin:'center center' }}>
              {/* Render beats with cinematic construction animations */}
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

## Beat Interpretation
For each beat in a scene:
- Read the visual field to decide WHAT to render — build the ACTUAL thing described
- Read the motion field for HOW to animate — use progressive construction (draw borders, type code, grow charts), NOT just fade-in
- Read the typography field for text styling and accent colors
- Use the beat's frameRange for timing within the scene
- Use the beat's slot field for pixel coordinates from the slot mapping table
- Wrap key panels in glass morphism style with glow
- Use animated gradient border on the most important panel per scene
- Stagger element entries by 8-12 frames for cinematic sequencing

## Output Format
Return ONLY the component code. No markdown fences, no explanation, no imports.
Start directly with: function Main({ scenePlan }) {`;
}

function buildCodePrompt(scenePlan: ScenePlan): string {
  return `Generate a Remotion React component for this scene plan. Create CINEMATIC, ByteMonk-quality motion graphics with:
- Glass morphism panels with subtle glow
- Animated rainbow gradient border on the most important panel per scene
- Progressive construction: borders draw themselves, tables reveal row-by-row, code types itself, charts grow upward
- Ambient purple glow at canvas bottom
- Staggered element entries (8-12 frame gaps)
- At least one idle animation per scene (glow pulse, gradient rotation)
- Cinematic scene entry: scale 0.92->1 with opacity fade over 15 frames

IMPORTANT:
- Start with: function Main({ scenePlan }) {
- Use only the globals in scope (React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing)
- Return ONLY the code, no markdown fences
- Extract reusable helpers (clamp, glass panel style, stagger function) at the top

Scene Plan JSON:
${JSON.stringify(scenePlan, null, 1)}`;
}

const MAIN_EXPORT_PATTERN = /export\s+default\s+(?:function\s+)?Main|export\s*\{\s*Main\s+as\s+default\s*\}|function\s+Main\s*\(/;

function hasMainComponent(code: string): boolean {
  return MAIN_EXPORT_PATTERN.test(code);
}

function cleanCodeOutput(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n?([\s\S]*?)\n?```/);
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

    const systemPrompt = buildCodeSystemPrompt(params.theme, params.layoutProfile);
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
          return Result.ok(code);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown code generation error";

        if (attempt === this.config.maxRetries) {
          return Result.fail(
            PipelineError.codeGenerationFailed(
              `Code generation failed after ${this.config.maxRetries + 1} attempts: ${message}`
            )
          );
        }
      }
    }

    return Result.fail(
      PipelineError.codeGenerationFailed(
        `Generated code does not contain a "Main" component after ${this.config.maxRetries + 1} attempts`
      )
    );
  }
}
