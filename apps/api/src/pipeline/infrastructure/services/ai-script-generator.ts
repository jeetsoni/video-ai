import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import {
  FORMAT_WORD_RANGES,
  structuredScriptResponseSchema,
} from "@video-ai/shared";
import type {
  ScriptGenerator,
  ScriptGenerationResult,
} from "@/pipeline/application/interfaces/script-generator.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

interface SceneBlock {
  id: number;
  name: string;
  type:
    | "Hook"
    | "Analogy"
    | "Bridge"
    | "Architecture"
    | "Spotlight"
    | "Comparison"
    | "Power"
    | "CTA";
  text: string;
}

interface StructuredScriptResponse {
  script: string;
  scenes: SceneBlock[];
}

export interface AIScriptGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIScriptGeneratorConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.7,
};

const VALID_SCENE_TYPES = new Set([
  "Hook",
  "Analogy",
  "Bridge",
  "Architecture",
  "Spotlight",
  "Comparison",
  "Power",
  "CTA",
]);

function getSceneCountRange(format: VideoFormat): { min: number; max: number } {
  if (format === "reel" || format === "short") {
    return { min: 2, max: 4 };
  }
  return { min: 3, max: 15 };
}

function buildSystemPrompt(
  wordRange: { min: number; max: number },
  sceneRange: { min: number; max: number },
): string {
  return [
    "You are a world-class short-form video scriptwriter who creates scroll-stopping, binge-worthy educational content. Your scripts are the kind that make people stop scrolling, watch to the very end, and immediately share.",
    "",
    "## Web Research (Google Search)",
    "You have access to Google Search. Use it when the topic mentions specific technologies, companies, APIs, tools, recent events, or statistics that you need accurate and up-to-date details about. This makes your scripts grounded in reality instead of generic placeholders. Search sparingly — only when you need factual accuracy.",
    "",
    "## HOOK FORMULAS (Scene 1 — MUST be irresistible)",
    "Use one of these proven hook patterns for the opening scene:",
    "- Contrarian: \"Everyone says X, but they're dead wrong.\"",
    "- Curiosity gap: \"There's a reason Y does Z — and it's not what you think.\"",
    "- Bold claim: \"This single concept changed how I think about X forever.\"",
    "- Pattern interrupt: Start mid-story, then rewind — \"...and that's when everything broke. Let me back up.\"",
    "- Shocking stat: Lead with a surprising number or fact that demands attention.",
    "- Direct challenge: \"If you're doing X, stop. Here's why.\"",
    "The hook must create an OPEN LOOP — a question or tension that can only be resolved by watching further.",
    "",
    "## RETENTION MECHANICS (keep viewers watching to the end)",
    "- Plant open loops early: \"I'll show you why in a moment\" / \"But here's where it gets interesting\"",
    "- Use \"but\" and \"here's the thing\" transitions — never clean handoffs that let viewers leave",
    "- End each scene with a micro-cliffhanger that pulls into the next scene",
    "- Vary pacing: mix short punchy sentences (3-5 words) with longer explanatory ones",
    "- Use the problem → agitate → solve structure within scenes",
    "- Create \"aha moments\" — build tension then release with a satisfying insight",
    "- Use specific numbers and examples instead of vague claims (\"3x faster\" not \"much faster\")",
    "- Address the viewer directly: \"you\", \"your\", \"imagine\"",
    "",
    "## EXPRESSION CUES (for natural voiceover delivery)",
    "Embed natural expression cues in the script text using *asterisks*. The TTS engine will PERFORM these as actual expressions — not speak the words. Use them sparingly for maximum impact:",
    "- *laughs* or *chuckles* — for humor or irony",
    "- *sighs* — for frustration or resignation",
    "- *pauses* — for dramatic effect before a reveal",
    "- *whispers* — for secrets or emphasis",
    "- *excited* — before high-energy moments",
    "Also use natural punctuation for expression:",
    "- Em dashes — for dramatic pauses and interruptions",
    "- Ellipses... for trailing off or building suspense",
    "- Short fragments. For. Emphasis.",
    "- Questions that make the viewer think: \"But wait — why would that matter?\"",
    "",
    "## CTA (Final Scene — NOT a generic \"follow for more\")",
    "End with one of:",
    "- A thought-provoking question that lingers",
    "- A teaser for a deeper rabbit hole: \"And that's just the surface...\"",
    "- A challenge: \"Try this yourself and see what happens\"",
    "- A reframe that changes how they see the topic",
    "",
    "## STRUCTURAL REQUIREMENTS",
    `- The full script MUST be between ${wordRange.min} and ${wordRange.max} words.`,
    `- Produce between ${sceneRange.min} and ${sceneRange.max} scene blocks.`,
    "- Each scene block must have:",
    "  - id: sequential number starting from 1",
    "  - name: short descriptive name",
    "  - type: one of Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA",
    "  - text: the spoken narration text (including expression cues)",
    '- FIRST scene MUST be type "Hook".',
    '- LAST scene MUST be type "CTA".',
    "- The full script field must equal the concatenation of all scene text fields joined by a single space.",
    "- Use conversational, spoken language — write for the ear, not the eye.",
    "- No scene markers or markdown formatting — only spoken narration text with expression cues.",
    "",
    "## Output Format",
    "Respond with ONLY valid JSON (no markdown fences, no extra text):",
    '{ "script": "full script text", "scenes": [{ "id": 1, "name": "...", "type": "Hook", "text": "..." }, ...] }',
  ].join("\n");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

export class AIScriptGenerator implements ScriptGenerator {
  private readonly config: AIScriptGeneratorConfig;

  constructor(config?: Partial<AIScriptGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generate(params: {
    topic: string;
    format: VideoFormat;
  }): Promise<Result<ScriptGenerationResult, PipelineError>> {
    const wordRange = FORMAT_WORD_RANGES[params.format];
    const sceneRange = getSceneCountRange(params.format);

    try {
      const google = createGoogleGenerativeAI({
        apiKey: process.env["GEMINI_API_KEY"] ?? "",
      });

      const searchTool = {
        google_search: google.tools.googleSearch({}),
      };

      const { text } = await generateText({
        model: google(this.config.model),
        tools: searchTool,
        stopWhen: stepCountIs(3),
        system: buildSystemPrompt(wordRange, sceneRange),
        prompt: params.topic,
        temperature: this.config.temperature,
      });

      if (!text || text.trim().length === 0) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            "LLM returned empty script output",
          ),
        );
      }

      const jsonStr = extractJson(text);
      const parsed = structuredScriptResponseSchema.safeParse(
        JSON.parse(jsonStr),
      );

      if (!parsed.success) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            `Failed to parse script response: ${parsed.error.message}`,
          ),
        );
      }

      const { scenes: sceneBlocks }: StructuredScriptResponse =
        parsed.data;

      // Validate scene count
      if (sceneBlocks.length < 2 || sceneBlocks.length > 15) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            `Invalid scene count: ${sceneBlocks.length}. Expected between 2 and 15.`,
          ),
        );
      }

      // Validate all scene types are valid
      for (const scene of sceneBlocks) {
        if (!VALID_SCENE_TYPES.has(scene.type)) {
          return Result.fail(
            PipelineError.scriptGenerationFailed(
              `Invalid scene type: "${scene.type}" in scene ${scene.id}`,
            ),
          );
        }
      }

      // Map scene blocks to SceneBoundary with placeholder timestamps
      const scenes: SceneBoundary[] = sceneBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        type: block.type,
        startTime: 0,
        endTime: 0,
        text: block.text,
      }));

      // Use concatenated scene text as the canonical script to guarantee
      // consistency. LLMs frequently produce slight mismatches between the
      // top-level script field and the joined scene texts.
      const canonicalScript = normalizeWhitespace(
        sceneBlocks.map((s) => s.text).join(" "),
      );

      return Result.ok({ script: canonicalScript, scenes });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown script generation error";
      return Result.fail(
        PipelineError.scriptGenerationFailed(
          `Script generation failed: ${message}`,
        ),
      );
    }
  }
}
