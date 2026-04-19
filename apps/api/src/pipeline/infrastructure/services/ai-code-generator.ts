import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ScenePlan, AnimationTheme, LayoutProfile } from "@video-ai/shared";
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

## Pre-built Primitives (ALREADY IN SCOPE — use these instead of writing from scratch)

The following components are pre-defined and available. ALWAYS prefer these over writing raw JSX:

### GlassPanel({ children, glow, padding, borderRadius, style })
Glass morphism container. glow = hex color string for boxShadow glow.
Example: GlassPanel({ glow: '#06B6D4', children: content })

### RainbowBorder({ children, frame, borderWidth, borderRadius, style })
Animated conic-gradient rainbow border wrapper. Pass current frame for rotation.
Example: RainbowBorder({ frame: localFrame, children: GlassPanel({ children: content }) })

### AmbientGlow({ color, style })
Purple ambient light at bottom of canvas. Render once per composition.
Example: AmbientGlow({}) or AmbientGlow({ color: 'rgba(139,92,246,0.2)' })

### SceneEntry({ children, frame, duration })
Cinematic scene entry: scale 0.92→1 + opacity 0→1. Wrap each scene's content.
Example: SceneEntry({ frame: localFrame, children: sceneContent })

### Stagger({ children, frame, delayPerItem, startDelay })
Staggers children entry with opacity + translateY. Each child delays by delayPerItem frames.
Example: Stagger({ frame: localFrame, delayPerItem: 10, children: [el1, el2, el3] })

### TypeWriter({ text, frame, duration, fontSize, color, fontFamily, style })
Text that types itself character by character with blinking cursor.
Example: TypeWriter({ text: 'Hello world', frame: localFrame, duration: 60, fontSize: 36 })

### CodeWindow({ code, title, frame, typingDuration, accentColor, style })
macOS-style terminal window with dots, title bar, and optional typing animation.
If typingDuration is set, code types itself. Otherwise shows full code immediately.
Example: CodeWindow({ code: 'npm install react', title: 'terminal.sh', frame: localFrame, typingDuration: 45 })

### DataTable({ headers, rows, frame, delayPerRow, startDelay, accentColor, style })
Table with row-by-row reveal and horizontal scanning highlight.
headers = string[], rows = string[][] (each row is array of cell strings).
Example: DataTable({ headers: ['Name','Size'], rows: [['GPT-4','1.8T'],['Gemma','8B']], frame: localFrame })

### FlowDiagram({ nodes, frame, startDelay, nodeGap, accentColor, direction, style })
Animated flow diagram. Nodes appear with scale, then arrows draw between them.
nodes = [{ label, sublabel?, icon? }], direction = 'horizontal' | 'vertical'.
Example: FlowDiagram({ nodes: [{label:'Input'},{label:'Process'},{label:'Output'}], frame: localFrame })

### BarChart({ bars, frame, startDelay, delayPerBar, maxHeight, barWidth, gap, style })
Animated bar chart. Bars grow upward with staggered timing + count-up values.
bars = [{ value, label, color? }].
Example: BarChart({ bars: [{value:85,label:'React',color:'#61DAFB'},{value:72,label:'Vue',color:'#42B883'}], frame: localFrame })

### CountUp({ target, frame, duration, fontSize, color, prefix, suffix, decimals, style })
Animated number counter from 0 to target.
Example: CountUp({ target: 1500, frame: localFrame, duration: 30, suffix: '+', fontSize: 72 })

### Badge({ label, color, fontSize, style })
Glowing accent badge/tag.
Example: Badge({ label: 'NEW', color: '#22C55E' })

### IconBox({ icon, size, color, style })
Glowing icon container. icon = string (emoji or text character).
Example: IconBox({ icon: '⚡', color: '#FFE600', size: 56 })

### DrawBorder({ width, height, frame, duration, color, strokeWidth, borderRadius, style })
SVG border that draws itself. Position absolute over a container.
IMPORTANT: width and height MUST be numeric pixel values (e.g., 400), NOT strings like "100%".
Example: DrawBorder({ width: 400, height: 200, frame: localFrame, duration: 30, color: '#06B6D4' })

### GlowPulse({ children, frame, color, intensity, speed })
Wraps children with a pulsing glow boxShadow.
Example: GlowPulse({ frame: localFrame, color: '#8B5CF6', children: panel })

### COMPOSITION RULES:
- ALWAYS use SceneEntry to wrap each scene's content
- ALWAYS render AmbientGlow once at the top level
- Use GlassPanel for ALL content containers
- Use RainbowBorder on the 1-2 most important panels per scene
- Use Stagger when showing multiple items (list items, cards, rows)
- Use CodeWindow for any code/terminal content — NEVER write raw pre/code tags
- Use DataTable for any tabular data — NEVER write raw table markup
- Use FlowDiagram for any process/pipeline/flow visualization
- Use BarChart for any comparative data
- Use CountUp for any statistics/numbers
- Use Badge for labels/tags
- Combine primitives: RainbowBorder > GlassPanel > DataTable is a common pattern

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
- Use <AmbientGlow /> at the top level (already provided as primitive)
- Text: ${theme.textPrimary} primary, ${theme.textMuted} muted

### Use Primitives for ALL Visuals
- Containers: <GlassPanel glow={accentColor}> — NEVER write raw div containers
- Key panels: <RainbowBorder frame={localFrame}><GlassPanel>...</GlassPanel></RainbowBorder>
- Code/terminals: <CodeWindow code={...} title={...} frame={localFrame} typingDuration={45} />
- Tables: <DataTable headers={[...]} rows={[...]} frame={localFrame} />
- Flows/pipelines: <FlowDiagram nodes={[...]} frame={localFrame} />
- Charts: <BarChart bars={[...]} frame={localFrame} />
- Numbers: <CountUp target={1500} frame={localFrame} duration={30} />
- Labels: <Badge label="NEW" color="#22C55E" />
- Icons: <IconBox icon="⚡" color="#FFE600" />
- Borders: <DrawBorder width={w} height={h} frame={localFrame} color={accent} />
- Glow: <GlowPulse frame={localFrame} color={accent}>...</GlowPulse>
- Scene entry: <SceneEntry frame={localFrame}>...</SceneEntry>
- Staggered items: <Stagger frame={localFrame} delayPerItem={10}>...</Stagger>

### Neon Glow on Custom Elements
- Use Badge for tags/labels with glow
- Use IconBox for icon containers with glow
- For custom elements: boxShadow "0 0 12px rgba(ACCENT,0.3)"

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
13. Every scene must have at least one element with subtle idle animation (glow pulse via GlowPulse, gradient rotation via RainbowBorder)

## Component Structure
function Main({ scenePlan }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CANVAS_TOP = ${safeZone.top};
  const CANVAS_H = ${safeZone.height};

  return (
    <AbsoluteFill style={{ backgroundColor:"${theme.background}" }}>
      <AmbientGlow />
      {scenePlan.scenes.map((scene) => {
        const sf = frame - scene.startFrame;
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
            <SceneEntry frame={sf}>
              <div style={{ position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H, display:"flex", flexDirection:"column", boxSizing:"border-box" }}>
                {/* Compose primitives: GlassPanel, RainbowBorder, CodeWindow, DataTable, FlowDiagram, etc. */}
              </div>
            </SceneEntry>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

## Beat Interpretation
For each beat in a scene:
- Read the visual field to decide WHICH PRIMITIVE to use (CodeWindow, DataTable, FlowDiagram, etc.)
- Read the motion field for timing — use Stagger for multiple items, TypeWriter for text
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
          return Result.ok(FULL_PRIMITIVES + "\n" + code);
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
