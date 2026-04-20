import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
  SceneBoundary,
  SceneDirection,
  SceneBeat,
  WordTimestamp,
  AnimationTheme,
  LayoutProfile,
} from "@video-ai/shared";
import { getCardTinted } from "@video-ai/shared";
import type { DirectionGenerator } from "@/pipeline/application/interfaces/direction-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AIDirectionGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIDirectionGeneratorConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.4,
};

const FPS = 30;

function buildDesignSystem(theme: AnimationTheme): string {
  const cards = getCardTinted(theme);
  return `## Design System

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

Typography (mobile canvas = 1080px wide — text must be LARGE to be readable):
- Hero titles: 88-120px, fontWeight 900, letterSpacing: -2
- Section headlines: 64-80px, fontWeight 800, letterSpacing: -1
- Subheadings / labels: 44-52px, fontWeight 700
- Body / descriptions: 36-42px, fontWeight 500
- Monospace (code, terminals, data): 30-38px
- NEVER use text smaller than 30px — it becomes unreadable on mobile

Visual rules:
- FILL THE SAFE ZONE — content must occupy at least 800px of the usable height
- Large breathing layouts: elements should span 70-100% of the usable width
- Card-based layouts with tinted backgrounds visibly distinct from the main bg
- Flat vector SVG icons inside icon boxes (56-72px, borderRadius:14-16)
- Thin 1px–1.5px solid borders with color at 0.2–0.35 opacity — consistent stroke weight throughout
- NO box-shadow, NO drop-shadow, NO glow — borders and tinted backgrounds define depth
- NO gradients on text, icons, or backgrounds — flat fills only; solid colors only
- NO glowing effects, NO 3D, NO neon, NO cartoon elements, NO exaggerated shapes
- Maximum 3-4 colors per visual — palette restraint is what makes it feel professional
- Stripe / Linear / Notion enterprise aesthetic — LARGE and BOLD for mobile
- Visual hierarchy per scene: clear headline title in the upper zone, primary visualization spanning the center, supporting labels/captions below`;
}

const ANIMATION_RULES = `## THE #1 RULE: VISUALIZE THE THING ITSELF — Not a Card About It

You are an expert motion graphics animator with a master teacher's instinct for visual explanation. The topics can be ANYTHING — science, history, business, technology, health, finance, philosophy, etc. When the speaker talks about a concept, you BUILD THE ACTUAL THING on screen — not a card that describes it.

Think: "If I were explaining this on a whiteboard or with a screen recording, what would I actually draw?"

### Concept → Real Visualization (MANDATORY)

For EVERY concept the speaker mentions, you don't make a card ABOUT it — you BUILD IT:

| Speaker talks about... | DON'T build | DO build |
|---|---|---|
| A process/workflow | Arrow between two labeled boxes | Full flow diagram with nodes, animated arrows, data moving along paths |
| Statistics/numbers | Card saying "85% increase" | Animated bar chart or pie chart with values counting up, axis labels, grid |
| Comparison | Two bullet points | Split-screen with actual visualizations side by side, pros/cons with icons |
| Timeline/history | List of dates | Horizontal timeline with era markers, event nodes, connecting lines |
| Hierarchy/structure | Nested bullet list | Org chart or tree diagram with boxes, connecting lines, labels |
| Cause and effect | Card saying "A causes B" | Domino-style chain diagram with animated triggers between stages |
| Geographic concept | Card with a flag emoji | Simplified map outline with highlighted regions, labels, data overlays |
| Scientific concept | Card with a beaker emoji | Actual diagram — molecule structure, cell cross-section, force diagram with vectors |
| Financial concept | Card saying "Revenue" | Dashboard with stat cards, mini line charts, percentage changes with arrows |
| Code/technical | Card saying "Code" | Mini IDE with syntax-highlighted code, line numbers, output panel |
| Conversation/quote | Card with quote marks | Actual chat-style UI with message bubbles, speaker labels, timestamps |
| List of items | Plain bullet list | Visual grid of cards with icons, labels, and short descriptions per item |
| Ranking | Numbered list | Podium-style visualization or horizontal bar chart with ranked items |
| Anatomy/parts | Card saying "3 parts" | Exploded diagram with labeled parts, connecting lines to a central element |

### Self-Check: If your visual description could be a bullet point on a PowerPoint slide, it's NOT visual enough. Rebuild it as a real diagram, chart, UI, or visual metaphor.

## Animation Direction Rules

Each scene gets 2-4 beats. Each beat must have:

### visual field (CRITICAL — describe the REAL VISUALIZATION):
1. What visualization this represents — name the THING (flow diagram, bar chart, timeline, tree diagram, dashboard, etc.)
2. What appears: every element with SPECIFIC content relevant to the topic (real labels, real numbers, real terms — not placeholders)
3. How it looks: exact colors from design system, sizes, border styles, backgrounds
4. Where it sits: spatial position within the safe zone
5. What changes: state transitions, reveals, highlights
6. How it connects to speech: which visual event at which spoken word
7. Continuity: what carries over from previous beat, what fades out

GOOD visual (builds the actual thing):
"Full-width comparison layout. LEFT panel (480px, red-tinted bg, 1.5px border): Title 'Before' at top, 3 stat rows showing declining metrics with red down-arrows and monospace numbers. RIGHT panel (480px, green-tinted bg): Title 'After', same 3 stats but with green up-arrows and improved numbers. Center divider line with 'VS' badge."

BAD visual (just a labeled card — NEVER DO THIS):
"Show a card with a chart emoji and title 'Performance Comparison'"

### typography field:
- Which spoken words get accent colors (word + hex color)
- Any special treatment: bold, larger scale

### motion field (Remotion-compatible):
- Spring configs: spring(damping:14, stiffness:200)
- Interpolation: interpolate(frame, [start, end], [0, 1])
- Entry: translateY from 40→0, scale from 0→1, opacity 0→1
- Exit: opacity fade over 8 frames
- Idle: Math.sin(frame*0.05)*3 for floating

### sfx field:
Available local SFX files:
- tech_blip.wav — card/element appears, transitions
- notification_ping.wav — important reveal, key word lands
- error_buzz.wav — error state, mistake, failure
- success_chime.wav — positive reveal, completion

Format: "filename at Xs volume:V playbackRate:R (reason)"
Use SFX generously — every visual event should have a matching sound.

## Attention Engineering
- Motion every 0.7-1.2 seconds
- Micro-payoff every 3-5 seconds
- Scale/direction change every 2-3 seconds

## Anti-Card-Laziness Validation
Before finalizing, check EVERY beat:
- Is any beat just "emoji + title + subtitle" on a card? → REDO IT as a real visualization
- Does every concept have a real visual (diagrams, charts, timelines, UIs, visual metaphors)?
- Is all content specific to the topic (real terms, real numbers, real labels)?
- Would a viewer understand the concept with audio muted? If not, visuals are too abstract.`;

function buildDirectionSystemPrompt(theme: AnimationTheme, layoutProfile: LayoutProfile): string {
  const { canvas, safeZone } = layoutProfile;
  const safeZoneBottom = safeZone.top + safeZone.height;

  return `You are a world-class motion graphics director. You receive a single scene boundary and produce detailed animation directions that result in RICH, PROFESSIONAL animations.

## CRITICAL LAYOUT CONSTRAINTS

Canvas: ${canvas.width}x${canvas.height}. Safe zone: top=${safeZone.top} to y=${safeZoneBottom} (${safeZone.height}px tall, ${safeZone.width}px wide after ${safeZone.left}px padding each side).

### FILL THE SAFE ZONE — This is mandatory
- Content must spread across the FULL ${safeZone.height}px usable height — not clustered in the top 200px
- Use large, breathing layouts: hero elements 600-800px tall, supporting elements below
- Every beat should describe where elements sit across the vertical space: top third, middle, bottom third
- Empty space = wasted screen = bad teaching — fill it with meaningful visuals

### Text sizes (mobile-first — must be large)
- Hero titles: 88-120px, fontWeight 900
- Section headlines: 64-80px, fontWeight 800
- Subheadings / labels: 44-52px, fontWeight 700
- Body / descriptions: 36-42px, fontWeight 500
- Monospace (code, data, terminals): 30-38px
- MINIMUM font size: 30px — anything smaller is unreadable on mobile

## THE #1 RULE: VISUALIZE THE THING ITSELF

When the speaker talks about a concept, you BUILD THE ACTUAL THING on screen — not a card that describes it.
- Chat conversation → build actual chat UI with message bubbles, timestamps, typing indicator
- API request → build terminal/Postman-style UI with method badge, URL, JSON response
- Error/bug → build actual terminal with red stack trace, file paths, line numbers
- Code execution → build mini IDE with syntax-highlighted code, line numbers, output panel
- Database → build SQL query with syntax highlighting → table result with rows/columns
- Pipeline/flow → build full flow diagram with nodes, animated arrows, data particles
- Search → build search bar with query typing, results with scores
- Dashboard → build actual stat cards, mini charts, percentage changes
- Statistics → build animated bar chart or pie chart with real numbers
- Timeline → build horizontal timeline with era markers, event nodes
- Comparison → build split-screen with actual visualizations side by side

If your visual description could be a bullet point on a PowerPoint slide, it's NOT visual enough. Every beat must describe a REAL UI or TECHNICAL VISUALIZATION with realistic content.

${buildDesignSystem(theme)}

${ANIMATION_RULES}

Respond with ONLY valid JSON for this single scene:
{
  "id": number,
  "name": "string",
  "type": "Hook|Analogy|Bridge|Architecture|Spotlight|Comparison|Power|CTA",
  "description": "one sentence purpose",
  "startTime": number,
  "endTime": number,
  "startFrame": number,
  "endFrame": number,
  "durationFrames": number,
  "text": "spoken text",
  "words": [{ "word": "string", "start": number, "end": number }],
  "animationDirection": {
    "colorAccent": "#hex",
    "mood": "string",
    "layout": "string",
    "beats": [{
      "id": "string",
      "timeRange": [start, end],
      "frameRange": [start, end],
      "spokenText": "string",
      "visual": "detailed description",
      "typography": "accent color assignments",
      "motion": "spring/interpolation specs",
      "sfx": ["filename.wav at time (reason)"]
    }]
  }
}`;
}

function buildDirectionPrompt(
  scene: SceneBoundary,
  words: WordTimestamp[],
  previousDirection?: SceneDirection
): string {
  const lines: string[] = [];

  if (previousDirection) {
    lines.push(
      "## Previous Scene Context (for narrative continuity)",
      `Scene: "${previousDirection.name}" (${previousDirection.type})`,
      `Mood: ${previousDirection.animationDirection.mood}`,
      `Color accent: ${previousDirection.animationDirection.colorAccent}`,
      `Layout: ${previousDirection.animationDirection.layout}`,
      `Last beat visual: "${previousDirection.animationDirection.beats.at(-1)?.visual ?? ""}"`,
      "",
      "Use this to ensure visual continuity — you may contrast, evolve, or build upon it, but avoid repeating the exact same layout or visual element.",
      ""
    );
  }

  const wordList = words
    .map((w) => `${w.word} [${w.start.toFixed(2)}-${w.end.toFixed(2)}]`)
    .join(" ");

  lines.push(
    `Generate detailed animation direction for this scene:`,
    ``,
    `Scene: ${scene.name} (${scene.type})`,
    `Time: ${scene.startTime.toFixed(2)}s - ${scene.endTime.toFixed(2)}s`,
    `Duration: ${(scene.endTime - scene.startTime).toFixed(2)}s`,
    `Spoken text: "${scene.text}"`,
    ``,
    `Word timestamps:`,
    wordList,
    ``,
    `Remember:`,
    `- startFrame = Math.round(startTime * 30), endFrame = Math.round(endTime * 30)`,
    `- durationFrames = endFrame - startFrame`,
    `- 2-4 beats covering the full scene duration`,
    `- Use correct accent colors based on word meaning`
  );

  return lines.join("\n");
}

export class AIDirectionGenerator implements DirectionGenerator {
  private readonly config: AIDirectionGeneratorConfig;

  constructor(config?: Partial<AIDirectionGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateDirection(params: {
    scene: SceneBoundary;
    words: WordTimestamp[];
    theme: AnimationTheme;
    layoutProfile: LayoutProfile;
    previousDirection?: SceneDirection;
  }): Promise<Result<SceneDirection, PipelineError>> {
    try {
      const google = createGoogleGenerativeAI({
        apiKey: process.env["GEMINI_API_KEY"] ?? "",
      });

      const { text } = await generateText({
        model: google(this.config.model),
        system: buildDirectionSystemPrompt(params.theme, params.layoutProfile),
        prompt: buildDirectionPrompt(params.scene, params.words, params.previousDirection),
        temperature: this.config.temperature,
      });

      if (!text || text.trim().length === 0) {
        return Result.fail(
          PipelineError.directionGenerationFailed(
            `Direction generation returned empty output for scene ${params.scene.id}`
          )
        );
      }

      const parsed = parseDirectionJson(text);
      if (!parsed) {
        return Result.fail(
          PipelineError.directionGenerationFailed(
            `Failed to parse direction output for scene ${params.scene.id}`
          )
        );
      }

      const startFrame = Math.round(params.scene.startTime * FPS);
      const endFrame = Math.round(params.scene.endTime * FPS);

      // Auto-correct beat boundaries
      if (parsed.beats.length >= 2) {
        parsed.beats[0]!.timeRange[0] = params.scene.startTime;
        parsed.beats[0]!.frameRange[0] = startFrame;
        parsed.beats[parsed.beats.length - 1]!.timeRange[1] = params.scene.endTime;
        parsed.beats[parsed.beats.length - 1]!.frameRange[1] = endFrame;
        for (let i = 1; i < parsed.beats.length; i++) {
          parsed.beats[i]!.timeRange[0] = parsed.beats[i - 1]!.timeRange[1];
          parsed.beats[i]!.frameRange[0] = Math.round(parsed.beats[i]!.timeRange[0] * FPS);
        }
      }

      const direction: SceneDirection = {
        id: params.scene.id,
        name: params.scene.name,
        type: params.scene.type,
        description: parsed.mood,
        startTime: params.scene.startTime,
        endTime: params.scene.endTime,
        startFrame,
        endFrame,
        durationFrames: endFrame - startFrame,
        text: params.scene.text,
        words: params.words,
        animationDirection: {
          colorAccent: parsed.colorAccent,
          mood: parsed.mood,
          layout: parsed.layout,
          beats: parsed.beats,
        },
      };

      return Result.ok(direction);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown direction generation error";
      return Result.fail(
        PipelineError.directionGenerationFailed(
          `Direction generation failed for scene ${params.scene.id}: ${message}`
        )
      );
    }
  }
}

interface ParsedDirection {
  colorAccent: string;
  mood: string;
  layout: string;
  beats: SceneBeat[];
}

function parseDirectionJson(raw: string): ParsedDirection | null {
  try {
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    let jsonStr = fenceMatch ? fenceMatch[1]!.trim() : raw.trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);

    if (
      typeof parsed.animationDirection?.colorAccent !== "string" ||
      typeof parsed.animationDirection?.mood !== "string" ||
      typeof parsed.animationDirection?.layout !== "string" ||
      !Array.isArray(parsed.animationDirection?.beats)
    ) {
      return null;
    }

    return {
      colorAccent: parsed.animationDirection.colorAccent,
      mood: parsed.animationDirection.mood,
      layout: parsed.animationDirection.layout,
      beats: parsed.animationDirection.beats,
    };
  } catch {
    return null;
  }
}
