import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ScenePlan, AnimationTheme } from "@video-ai/shared";
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

function buildCodeSystemPrompt(theme: AnimationTheme): string {
  return `You are a world-class Remotion motion graphics engineer. You receive a ScenePlan JSON and produce a React component that renders RICH, PROFESSIONAL animated motion graphics.

## Available Globals (do NOT import)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing

## Layout — FILL THE SAFE ZONE (critical)

Canvas: 1080x1920. Safe zone: CANVAS_TOP=80, CANVAS_H=1080 (y=80 to y=1160).
- Wrap all content: position:"absolute", top:CANVAS_TOP, left:44, right:44, height:CANVAS_H
- Content MUST spread across the full 1080px height — not clustered at the top
- Width: elements should span 70-100% of the 992px usable width

## Typography (mobile-first — always large, ADAPTIVE to content density)
- 1-2 blocks: hero titles 96-120, headlines 68-80
- 3-4 blocks: hero titles 72-88, headlines 56-64, body 32-38
- 5+ blocks: hero titles 56-68, headlines 44-52, body 30-34
- MINIMUM fontSize: 28 — never go smaller

## Visual Quality Rules
- Background: ${theme.background} — cards must be visibly lighter (${theme.surface}, ${theme.raised})
- Text: ${theme.textPrimary} primary, ${theme.textMuted} muted — always high contrast
- Card borders: 1px-1.5px solid with color at 0.2-0.35 opacity
- NO box-shadow, NO drop-shadow — depth from tinted backgrounds and borders only
- NO gradients on text, backgrounds, or icons — flat solid fills only
- Use SVG for diagrams, flow charts, scatter plots — NOT placeholder shapes
- Realistic content: real error messages, real code, real data — no lorem ipsum
- NO glowing, NO 3D, NO neon — Stripe/Linear/Notion enterprise aesthetic
- Smooth spring entries: spring({ frame, fps, config: { damping:14, stiffness:180 } })
- Idle animation: Math.sin(frame * 0.04) * 4 for subtle float

## Defensive Layout Rules
- Add overflow:'hidden' to fixed-size containers not animating their size
- For static siblings, use flexbox + gap instead of position:'absolute'
- NEVER use textOverflow:'ellipsis' on titles — reduce fontSize or let it wrap
- Add boxSizing:'border-box' to elements with both padding and a fixed size
- PREFER flexbox with flexShrink:1 and minHeight:0 for stacking cards vertically

## Rules
1. function Main({ scenePlan }) — receives the full ScenePlan JSON
2. Use useCurrentFrame() and useVideoConfig() for timing
3. Use <Sequence from={frameNumber} durationInFrames={duration}> to time scenes and beats
4. Use interpolate() with extrapolateLeft:'clamp', extrapolateRight:'clamp'
5. Inline styles only — no CSS imports, no Tailwind
6. Do NOT use any imports — everything is in scope
7. Do NOT use <Audio>, <Video>, <Img>, or any media tags
8. Keep code under 450 lines — write DRY, compact code
9. NO code comments — zero comments
10. Extract repeated style objects into shared const variables
11. ALWAYS add a global scene entry fade: interpolate(frame, [0, 8], [0, 1], clamp)

## Component Structure
function Main({ scenePlan }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CANVAS_TOP = 80;
  const CANVAS_H = 1080;

  return (
    <AbsoluteFill style={{ backgroundColor: "${theme.background}" }}>
      {scenePlan.scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
          <div style={{ position:"absolute", top:CANVAS_TOP, left:44, right:44, height:CANVAS_H, display:"flex", flexDirection:"column", boxSizing:"border-box" }}>
            {/* Scene content — interpret animationDirection.beats */}
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

## Beat Interpretation
For each beat in a scene:
- Read the visual field to decide WHAT to render
- Read the motion field to decide HOW to animate
- Read the typography field to decide text styling and accent colors
- Use the beat's frameRange for timing within the scene

## Output Format
Return ONLY the component code. No markdown fences, no explanation, no imports.
Start directly with: function Main({ scenePlan }) {`;
}

function buildCodePrompt(scenePlan: ScenePlan): string {
  return `Generate a Remotion React component for this scene plan. The component should create beautiful, animated motion graphics that visualize the spoken content.

IMPORTANT:
- Start with: function Main({ scenePlan }) {
- Use only the globals in scope (React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing)
- Return ONLY the code, no markdown fences

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
  }): Promise<Result<string, PipelineError>> {
    const google = createGoogleGenerativeAI({
      apiKey: process.env["GEMINI_API_KEY"] ?? "",
    });

    const systemPrompt = buildCodeSystemPrompt(params.theme);
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
