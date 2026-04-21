import { streamObject, generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { VideoFormat, SceneBoundary } from "@video-ai/shared";
import { FORMAT_WORD_RANGES, sceneBlockSchema } from "@video-ai/shared";
import type { StreamingScriptGenerator } from "@/pipeline/application/interfaces/streaming-script-generator.js";
import type { ScriptGenerationResult } from "@/pipeline/application/interfaces/script-generator.js";
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

export interface AIStreamingScriptGeneratorConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIStreamingScriptGeneratorConfig = {
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

/** Scenes-only schema for streaming — forces the LLM to generate scenes
 *  sequentially so we get interleaved scene metadata + text chunks. */
const streamingScriptSchema = z.object({
  scenes: z.array(sceneBlockSchema).min(2).max(15),
});

function buildSystemPrompt(
  wordRange: { min: number; max: number },
  sceneRange: { min: number; max: number },
): string {
  return [
    "You are a world-class short-form video scriptwriter who creates scroll-stopping, binge-worthy educational content. Your scripts are the kind that make people stop scrolling, watch to the very end, and immediately share.",
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
    `- Total word count MUST be between ${wordRange.min} and ${wordRange.max} words.`,
    `- Produce between ${sceneRange.min} and ${sceneRange.max} scene blocks.`,
    "- Each scene block must have:",
    "  - id: sequential number starting from 1",
    "  - name: short descriptive name",
    "  - type: one of Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA",
    "  - text: the spoken narration text (including expression cues)",
    '- FIRST scene MUST be type "Hook".',
    '- LAST scene MUST be type "CTA".',
    "- Use conversational, spoken language — write for the ear, not the eye.",
    "- No stage directions, scene markers, or markdown formatting — only spoken narration text with expression cues.",
  ].join("\n");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isCompleteScene(
  scene: Partial<SceneBlock> | undefined,
): scene is SceneBlock {
  if (!scene) return false;
  return (
    typeof scene.id === "number" &&
    typeof scene.name === "string" &&
    scene.name.length > 0 &&
    typeof scene.type === "string" &&
    VALID_SCENE_TYPES.has(scene.type) &&
    typeof scene.text === "string" &&
    scene.text.length > 0
  );
}

export class AIStreamingScriptGenerator implements StreamingScriptGenerator {
  private readonly config: AIStreamingScriptGeneratorConfig;

  constructor(config?: Partial<AIStreamingScriptGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateStream(params: {
    topic: string;
    format: VideoFormat;
    onChunk: (text: string) => void;
    onScene: (scene: SceneBoundary) => void;
    onStatus: (message: string) => void;
    onDone: (result: ScriptGenerationResult) => void;
    onError: (error: PipelineError) => void;
  }): Promise<Result<ScriptGenerationResult, PipelineError>> {
    const wordRange = FORMAT_WORD_RANGES[params.format];
    const sceneRange = getSceneCountRange(params.format);

    try {
      const google = createGoogleGenerativeAI({
        apiKey: process.env["GEMINI_API_KEY"] ?? "",
      });

      // --- Research step: use Google Search to gather context ---
      let researchContext = "";
      try {
        params.onStatus("Researching topic on the web...");

        const searchTool = {
          google_search: google.tools.googleSearch({}),
        };

        const { text: researchText } = await generateText({
          model: google(this.config.model),
          tools: searchTool,
          stopWhen: stepCountIs(3),
          system:
            "You are a research assistant. Search the web for accurate, current information about the given topic. " +
            "Summarize the key facts, statistics, and details that would be useful for writing an educational video script. " +
            "Be concise — focus on the most interesting and accurate details.",
          prompt: params.topic,
          temperature: 0.2,
        });

        if (researchText?.trim()) {
          researchContext = researchText.trim();
          params.onStatus("Research complete — writing script...");
        }
      } catch {
        // Research is best-effort — continue without it
        params.onStatus("Writing script...");
      }

      // --- Streaming script generation (with research context injected) ---
      const researchBlock = researchContext
        ? `\n\n## Research Context (use these facts to make the script accurate and specific):\n${researchContext}`
        : "";

      const { partialObjectStream, object: objectPromise } = streamObject({
        model: google(this.config.model),
        schema: streamingScriptSchema,
        system: buildSystemPrompt(wordRange, sceneRange),
        prompt: params.topic + researchBlock,
        temperature: this.config.temperature,
      });

      let emittedSceneCount = 0;
      // Track how much text we've emitted per scene (by index)
      const sceneTextEmitted: number[] = [];

      for await (const partial of partialObjectStream) {
        const scenes = partial.scenes ?? [];

        // Stream text from scenes as they build up.
        for (let i = 0; i < scenes.length; i++) {
          const candidate = scenes[i];
          if (!candidate || typeof candidate.text !== "string") continue;

          const prevLength = sceneTextEmitted[i] ?? 0;
          if (candidate.text.length > prevLength) {
            const newText = candidate.text.slice(prevLength);
            params.onChunk(newText);
            sceneTextEmitted[i] = candidate.text.length;
          }
        }

        // A scene is complete when the NEXT scene has started appearing.
        // This means the LLM has moved on from the current scene.
        while (emittedSceneCount < scenes.length - 1) {
          const completedScene = scenes[emittedSceneCount];
          if (!completedScene || !isCompleteScene(completedScene)) break;

          params.onScene({
            id: completedScene.id,
            name: completedScene.name,
            type: completedScene.type,
            startTime: 0,
            endTime: 0,
            text: completedScene.text,
          });
          emittedSceneCount++;
        }
      }

      // Emit any remaining scenes that weren't emitted during streaming
      // (the last scene never has a "next" scene to trigger it)
      const finalPartialScenes = (await objectPromise).scenes;
      for (let i = emittedSceneCount; i < finalPartialScenes.length; i++) {
        const scene = finalPartialScenes[i]!;
        params.onScene({
          id: scene.id,
          name: scene.name,
          type: scene.type as SceneBoundary["type"],
          startTime: 0,
          endTime: 0,
          text: scene.text,
        });
      }

      // Validate the final result
      const sceneBlocks = finalPartialScenes;

      if (sceneBlocks.length < 2 || sceneBlocks.length > 15) {
        const error = PipelineError.scriptGenerationFailed(
          `Invalid scene count: ${sceneBlocks.length}. Expected between 2 and 15.`,
        );
        params.onError(error);
        return Result.fail(error);
      }

      for (const scene of sceneBlocks) {
        if (!VALID_SCENE_TYPES.has(scene.type)) {
          const error = PipelineError.scriptGenerationFailed(
            `Invalid scene type: "${scene.type}" in scene ${scene.id}`,
          );
          params.onError(error);
          return Result.fail(error);
        }
      }

      const scenes: SceneBoundary[] = sceneBlocks.map((block: SceneBlock) => ({
        id: block.id,
        name: block.name,
        type: block.type,
        startTime: 0,
        endTime: 0,
        text: block.text,
      }));

      const canonicalScript = normalizeWhitespace(
        sceneBlocks.map((s: SceneBlock) => s.text).join(" "),
      );

      const result: ScriptGenerationResult = {
        script: canonicalScript,
        scenes,
      };
      params.onDone(result);
      return Result.ok(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown script generation error";
      const pipelineError = PipelineError.scriptGenerationFailed(
        `Script generation failed: ${message}`,
      );
      params.onError(pipelineError);
      return Result.fail(pipelineError);
    }
  }
}
