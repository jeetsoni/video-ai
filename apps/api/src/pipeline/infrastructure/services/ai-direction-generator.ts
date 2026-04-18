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

Typography (mobile canvas = 1080px wide — text must be LARGE to be readable):
- Hero titles: 88-120px, fontWeight 900, letterSpacing: -2
- Section headlines: 64-80px, fontWeight 800, letterSpacing: -1
- Subheadings / labels: 44-52px, fontWeight 700
- Body / descriptions: 36-42px, fontWeight 500
- Monospace (code, terminals, data): 30-38px
- NEVER use text smaller than 30px — it becomes unreadable on mobile`;
}

const ANIMATION_RULES = `## THE #1 RULE: VISUALIZE THE THING ITSELF — Not a Card About It

When the speaker talks about a concept, BUILD THE ACTUAL THING on screen — not a card that describes it.

| Speaker talks about... | DON'T build | DO build |
|---|---|---|
| Chat conversation | Card with emoji saying "chat" | Actual chat UI with message bubbles, timestamps |
| API request | Card saying "API Call" | Terminal-style UI with method badge, URL, JSON response |
| Database query | Card saying "Database" | SQL query with syntax highlighting, table result |
| Code execution | Card saying "Code runs" | Mini IDE with syntax-highlighted code, output panel |
| Error/bug | Card with X saying "Error" | Terminal with red stack trace, file paths |
| Pipeline/flow | Arrow between two cards | Full flow diagram with nodes, animated arrows |
| Dashboard/metrics | Card saying "Analytics" | Actual dashboard with stat cards, mini charts |

Self-Check: If your visual description could be a bullet point on a PowerPoint slide, it's NOT visual enough.

## Animation Direction Rules

Each scene gets 2-4 beats. Each beat must have:

### visual field (CRITICAL — describe the REAL UI/VISUALIZATION):
1. What real-world UI or visualization this represents
2. What appears: every element with REALISTIC content
3. How it looks: exact colors from design system, sizes, border styles
4. Where it sits: spatial position
5. What changes: state transitions
6. How it connects to speech: which visual event at which spoken word

### typography field:
- Which spoken words get accent colors (word + hex color)

### motion field (Remotion-compatible):
- Spring configs: spring(damping:14, stiffness:200)
- Interpolation: interpolate(frame, [start, end], [0, 1])
- Entry: translateY from 40->0, scale from 0->1, opacity 0->1

### sfx field:
Format: "filename at Xs volume:V playbackRate:R (reason)"
Available: tech_blip.wav, notification_ping.wav, error_buzz.wav, success_chime.wav

## Attention Engineering
- Motion every 0.7-1.2 seconds
- Micro-payoff every 3-5 seconds
- Sound at every visual event`;

function buildSlotVocabulary(layoutProfile: LayoutProfile): string {
  const slotEntries = Object.values(layoutProfile.slots);
  if (slotEntries.length === 0) return "";

  const lines = ["## Available Spatial Slots", ""];
  lines.push("Each beat MUST be assigned to one of these slots. Beats assigned to different slots MUST NOT produce overlapping visuals.");
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

function buildDirectionSystemPrompt(theme: AnimationTheme, layoutProfile: LayoutProfile): string {
  const { canvas, safeZone } = layoutProfile;
  const safeZoneBottom = safeZone.top + safeZone.height;

  return `You are a world-class motion graphics director. You receive a single scene boundary and produce detailed animation directions that result in RICH, PROFESSIONAL animations.

## CRITICAL LAYOUT CONSTRAINTS

Canvas: ${canvas.width}x${canvas.height}. Safe zone: top=${safeZone.top} to y=${safeZoneBottom} (${safeZone.height}px tall, ${safeZone.width}px wide after ${safeZone.left}px padding each side).
Content must spread across the FULL ${safeZone.height}px usable height — not clustered in the top 200px.

${buildSlotVocabulary(layoutProfile)}

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
      "sfx": ["filename.wav at time (reason)"],
      "slot": "slot id from available slots"
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

function autoCorrectSlotAssignments(beats: SceneBeat[], layoutProfile: LayoutProfile): void {
  const slotIds = Object.keys(layoutProfile.slots);
  if (slotIds.length === 0) return;

  const firstSlotId = slotIds[0]!;
  const lastSlotId = slotIds[slotIds.length - 1]!;
  const centerSlotId = layoutProfile.slots["center"]
    ? "center"
    : slotIds[Math.floor(slotIds.length / 2)]!;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    if (!beat.slot || !slotIds.includes(beat.slot)) {
      const originalSlot = beat.slot;
      if (i === 0) {
        beat.slot = firstSlotId;
      } else if (i === beats.length - 1) {
        beat.slot = lastSlotId;
      } else {
        beat.slot = centerSlotId;
      }
      console.warn(
        `Auto-corrected invalid slot "${originalSlot ?? "(missing)"}" to "${beat.slot}" for beat "${beat.id}"`
      );
    }
  }
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

      // Auto-correct IDs and times to match the boundary
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

      // Auto-correct invalid slot assignments
      autoCorrectSlotAssignments(parsed.beats, params.layoutProfile);

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
