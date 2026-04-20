import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
  SceneDirection,
  AnimationTheme,
  LayoutProfile,
} from "@video-ai/shared";
import { getCardTinted } from "@video-ai/shared";
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
  temperature: 0.3,
  maxRetries: 2,
};

function buildDesignSystemSection(
  theme: AnimationTheme,
  layoutProfile: LayoutProfile,
): string {
  const cards = getCardTinted(theme);
  const { canvas, safeZone } = layoutProfile;
  const safeZoneBottom = safeZone.top + safeZone.height;

  return `## Layout — FILL THE SAFE ZONE (critical)

Canvas: ${canvas.width}x${canvas.height}. Safe zone: CANVAS_TOP=${safeZone.top}, CANVAS_H=${safeZone.height} (y=${safeZone.top} to y=${safeZoneBottom}).

- Wrap all content: position:"absolute", top:CANVAS_TOP, left:${safeZone.left}, right:${safeZone.left}, height:CANVAS_H
- Content MUST spread across the full ${safeZone.height}px height — not clustered at the top
- Use large elements: hero visuals 500-700px tall, supporting content below
- Width: elements should span 70-100% of the ${safeZone.width}px usable width

## Design System

Colors:
- Background: ${theme.background}
- Surface: ${theme.surface}
- Raised: ${theme.raised}
- Text Primary: ${theme.textPrimary}
- Text Muted: ${theme.textMuted}
- Accents:
  - hookFear (Red): ${theme.accents.hookFear} — errors, mistakes, failures, negatives
  - wrongPath (Amber): ${theme.accents.wrongPath} — warnings, analogies, real-world concepts
  - techCode (Sky Blue): ${theme.accents.techCode} — tech terms, code, system components
  - revelation (Green): ${theme.accents.revelation} — solutions, success, positive outcomes
  - cta (Yellow): ${theme.accents.cta} — CTA, power statements, revelations
  - violet: ${theme.accents.violet} — architecture, orchestration, system-level

Card tinted backgrounds (must be visibly distinct from ${theme.background} background):
- CARD_SKY: ${cards.sky}, CARD_RED: ${cards.red}, CARD_GREEN: ${cards.green}
- CARD_AMBER: ${cards.amber}, CARD_VIOLET: ${cards.violet}, CARD_YELLOW: ${cards.yellow}

Typography (mobile-first — always large, ADAPTIVE to content density):
Count the number of distinct visual blocks (cards, panels, code boxes, diagrams) in the scene.
- 1-2 blocks → use LARGE sizes (hero titles 96-120, headlines 68-80)
- 3-4 blocks → use MEDIUM sizes (hero titles 72-88, headlines 56-64, body 32-38)
- 5+ blocks → use COMPACT sizes (hero titles 56-68, headlines 44-52, body 30-34)
- MINIMUM fontSize: 28 — never go smaller
- Monospace for code/tech: fontFamily 'monospace'

CRITICAL: Before writing any layout, calculate total height budget:
- Sum up all block heights + gaps. If total > CANVAS_H (${safeZone.height}), reduce block heights or font sizes until it fits.`;
}

function buildCodeSystemPrompt(
  theme: AnimationTheme,
  layoutProfile: LayoutProfile,
): string {
  return `You are a world-class Remotion motion graphics engineer. You receive a single scene's animation direction and produce a React component that renders RICH, PROFESSIONAL animated motion graphics — the quality of a senior designer at a top tech company, combined with the clarity of a master teacher.

## ABSOLUTE RULES (violating these is a critical bug)
- NEVER use textOverflow:'ellipsis' or whiteSpace:'nowrap' on ANY title, heading, or headline text. Titles must ALWAYS be fully visible. If a title is too long, reduce its fontSize or let it wrap to 2 lines — never truncate it with "...".
- NEVER use <img> tags or external URLs for logos/icons — they will 404 or be blocked by CORS. Draw logos as inline <svg> elements with <path> data in JSX.

## Available Globals (do NOT import)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing
- Audio, staticFile (for SFX sounds)

${buildDesignSystemSection(theme, layoutProfile)}

## Visual Quality Rules
1. Background: "${theme.background}" — cards must be visibly lighter (${theme.surface}, ${theme.raised}, or tinted variants)
2. Text: ${theme.textPrimary} primary, ${theme.textMuted} muted — always high contrast against card bg
3. Card borders: 1px–1.5px solid with color at 0.2–0.35 opacity — thin, consistent stroke weight
4. NO box-shadow, NO drop-shadow anywhere — depth comes from tinted backgrounds and borders only
5. NO gradients on text, backgrounds, or icons — flat solid fills only
6. Icon boxes: 60-72px, borderRadius:14-16
7. Use SVG for diagrams, flow charts, scatter plots — NOT placeholder shapes
8. Realistic content: real error messages, real code, real data — no lorem ipsum
9. NO glowing, NO 3D, NO neon, NO exaggerated shapes — Stripe/Linear/Notion enterprise aesthetic
10. Smooth spring entries: spring({ frame, fps, config: { damping:14, stiffness:180 } })
11. Idle animation: Math.sin(frame * 0.04) * 4 for subtle float
12. Visual structure: scene headline title in the upper zone (~top 200px), primary visualization center, supporting labels below
13. HEIGHT BUDGET: Before coding, list every block with its height. Sum must be ≤ CANVAS_H (${layoutProfile.safeZone.height}) including gaps. If it exceeds, shrink the largest blocks first.
14. LOGOS AND ICONS: NEVER use <img> tags or external URLs — draw logos as inline SVG <svg> elements with <path> data directly in JSX. For well-known companies, reproduce their logo as a simplified SVG path. A simple but visible icon is always better than a broken image.

## Defensive Layout Rules (prevent accidental overflow — NOT intentional animations)
These rules apply to STATIC layout only. Animated elements (using interpolate/spring on position/size) are exempt.

- ALWAYS add overflow:'hidden' to every card/container that has a fixed width or height and is NOT itself animating its size
- EVERY text element inside a fixed-height container MUST have overflow protection:
  - HERO TITLES and HEADLINES: NEVER use textOverflow:'ellipsis' — reduce fontSize until text fits on 1-2 lines, or allow wrapping with overflow:'hidden' and a line clamp of 2-3 lines
  - Single-line LABELS and SMALL TEXT (not titles): whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'
  - Multi-line body text → overflow:'hidden', display:'-webkit-box', WebkitLineClamp:N, WebkitBoxOrient:'vertical'
- For sibling elements that are BOTH statically positioned, use flexbox (display:'flex', gap:N) instead of position:'absolute'
- ALWAYS add boxSizing:'border-box' to any element with both padding and a fixed size
- PREFER flexbox with flexShrink:1 and minHeight:0 for stacking cards vertically
- NEVER mix CSS shorthand and longhand for the same property on the same element:
  - textDecoration + textDecorationColor → use textDecoration shorthand only
  - border + borderColor → use border shorthand or all longhands, never mix
  - padding + paddingTop → use padding shorthand only

## Rules
1. function Main({ scene }) — \`useCurrentFrame()\` returns 0 at scene start (Remotion <Sequence> resets it)
2. NEVER subtract scene.startFrame from \`useCurrentFrame()\` or create a variable like \`frame - scene.startFrame\` — the frame is ALREADY scene-local
3. beat.frameRange values are ABSOLUTE — subtract scene.startFrame from the frameRange values (NOT from the frame variable) to get scene-relative timing
4. Inline styles only — no CSS imports, no Tailwind
5. Keep code under 300 lines — write DRY, compact code
6. Return ONLY the code — no markdown fences, no explanation
7. ALWAYS add a global scene entry fade: compute \`const sceneEnterOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });\` and apply \`opacity: sceneEnterOpacity\` to the outermost content div.
8. NO code comments — zero comments
9. Extract repeated style objects into shared const variables at the top of Main
10. Extract repeated interpolate/spring patterns into helper functions
11. Use short variable names for internal helpers
12. For SVG icons, use the simplest recognizable path
13. Combine adjacent elements that share the same animation timing into a single wrapper div
14. If multiple cards share the same structure, use a .map() over a data array

## Component Structure
function Main({ scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CANVAS_TOP = ${layoutProfile.safeZone.top};
  const CANVAS_H = ${layoutProfile.safeZone.height};

  const sceneEnterOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: "${theme.background}" }}>
      <div style={{ position:"absolute", top:CANVAS_TOP, left:${layoutProfile.safeZone.left}, right:${layoutProfile.safeZone.left}, height:CANVAS_H, display:"flex", flexDirection:"column", boxSizing:"border-box", opacity: sceneEnterOpacity }}>
        {/* FILL THIS SPACE — spread content across full ${layoutProfile.safeZone.height}px height */}
      </div>
    </AbsoluteFill>
  );
}

## Beat Interpretation — Frame Timing (CRITICAL)
This component is rendered inside a Remotion <Sequence> that ALREADY resets the frame counter.
- \`useCurrentFrame()\` returns 0 at the start of THIS scene — it is ALREADY scene-relative.
- NEVER subtract scene.startFrame from \`useCurrentFrame()\`. The frame variable is already local.
- beat.frameRange values in the JSON are ABSOLUTE (relative to the whole video). To convert them to scene-local frames, subtract scene.startFrame from the beat frameRange values ONLY — not from the frame variable.
- Example: if beat.frameRange = [613, 750] and scene.startFrame = 613, the beat starts at local frame 0 (613-613) and ends at local frame 137 (750-613).

For each beat in a scene:
- Read the visual field to decide WHAT to render — build the actual visualization described (diagrams, charts, UIs, visual metaphors)
- Read the motion field for timing and animation specs
- Read the typography field for text styling and accent colors
- Convert beat.frameRange to scene-local frames by subtracting scene.startFrame from the frameRange values

## Output Format
Return ONLY the component code. No markdown fences, no explanation, no imports.
Start directly with: function Main({ scene }) {`;
}

function buildCodePrompt(scene: SceneDirection): string {
  return `Generate a Remotion component for this single scene. The component receives the scene object as a prop called "scene".

IMPORTANT:
- This component is rendered inside a <Sequence> — useCurrentFrame() ALREADY returns 0 at scene start
- NEVER subtract scene.startFrame from useCurrentFrame() — the frame is already scene-local
- beat.frameRange values are ABSOLUTE — subtract scene.startFrame from the frameRange values (not from the frame variable) to get scene-relative timing
- Start with: function Main({ scene }) {
- Return ONLY code
- Build the ACTUAL visualization described in each beat — diagrams, charts, UIs, visual metaphors — not generic cards with emoji

Scene JSON:
${JSON.stringify(scene, null, 1)}`;
}

function stripModuleStatements(code: string): string {
  return (
    code
      // Remove import statements (handles multiple on same line and multiline)
      .replace(
        /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+["'][^"']+["'];?/g,
        "",
      )
      // Remove simple import side-effect statements like: import "module";
      .replace(/import\s+["'][^"']+["'];?/g, "")
      // Remove export default
      .replace(/export\s+default\s+/g, "")
      // Remove named exports
      .replace(/export\s+(?=(?:const|let|var|function|class|async)\s)/g, "")
      // Remove destructuring from React that tries to get Remotion globals
      .replace(/const\s+\{[^}]*\}\s*=\s*React\s*;?/g, "")
      .trim()
  );
}

function extractCode(text: string): string {
  const fenceMatch = text.match(
    /```(?:tsx|jsx|typescript|javascript)?\s*\n?([\s\S]*?)\n?```/,
  );
  let code = fenceMatch ? fenceMatch[1]!.trim() : text.trim();

  // Strip import/export statements (AI sometimes adds them despite instructions)
  code = stripModuleStatements(code);

  if (code.startsWith("function Main")) return code;
  const funcStart = code.indexOf("function Main");
  if (funcStart !== -1) return code.slice(funcStart);
  return code;
}

export class AICodeGenerator implements CodeGenerator {
  private readonly config: AICodeGeneratorConfig;

  constructor(config?: Partial<AICodeGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateSceneCode(params: {
    scene: SceneDirection;
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
    const prompt = buildCodePrompt(params.scene);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const retryHint =
          attempt > 0
            ? `\n\nPREVIOUS ATTEMPT FAILED: The code did not contain a "Main" function. You MUST start with: function Main({ scene }) {`
            : "";

        const { text } = await generateText({
          model: google(this.config.model),
          system: systemPrompt,
          prompt: prompt + retryHint,
          temperature: this.config.temperature,
          providerOptions: {
            google: { thinkingConfig: { thinkingBudget: 8192 } },
          },
        });

        if (!text || text.trim().length === 0) continue;

        const code = extractCode(text);

        if (code.includes("Main")) {
          return Result.ok(code);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown code generation error";

        if (attempt === this.config.maxRetries) {
          return Result.fail(
            PipelineError.codeGenerationFailed(
              `Code generation failed for scene ${params.scene.id} after ${this.config.maxRetries + 1} attempts: ${message}`,
            ),
          );
        }
      }
    }

    return Result.fail(
      PipelineError.codeGenerationFailed(
        `Generated code for scene ${params.scene.id} does not contain a "Main" component after ${this.config.maxRetries + 1} attempts`,
      ),
    );
  }
}
