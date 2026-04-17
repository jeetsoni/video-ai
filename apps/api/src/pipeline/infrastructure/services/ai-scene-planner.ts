import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import { sceneBoundariesResponseSchema } from "@video-ai/shared";
import type { ScenePlanner } from "@/pipeline/application/interfaces/scene-planner.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AIScenePlannerConfig {
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: AIScenePlannerConfig = {
  model: "gpt-4o",
  temperature: 0.3,
};

const SCENE_PLANNING_SYSTEM_PROMPT = [
  "You are an expert video scene planner for educational content.",
  "Given a transcript with word-level timestamps, segment it into logical scenes.",
  "",
  "Rules:",
  "- Produce between 2 and 15 scenes depending on total duration.",
  "- Each scene must have a type from: Hook, Analogy, Bridge, Architecture, Spotlight, Comparison, Power, CTA.",
  "- Scene time boundaries must be contiguous: each scene's endTime equals the next scene's startTime.",
  "- The first scene's startTime must be <= the first word's start timestamp.",
  "- The last scene's endTime must be >= the last word's end timestamp.",
  "- No gaps or overlaps between scenes.",
  "- Each scene's text field should contain the spoken words that fall within that scene's time range.",
  "- Give each scene a short, descriptive name.",
  "- Scene IDs should be sequential starting from 1.",
].join("\n");

export class AIScenePlanner implements ScenePlanner {
  private readonly config: AIScenePlannerConfig;

  constructor(config?: Partial<AIScenePlannerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async planScenes(params: {
    transcript: WordTimestamp[];
    fullText: string;
    totalDuration: number;
  }): Promise<Result<SceneBoundary[], PipelineError>> {
    try {
      const prompt = formatTranscriptForPlanning(params);

      const { object } = await generateObject({
        model: openai(this.config.model),
        schema: sceneBoundariesResponseSchema,
        system: SCENE_PLANNING_SYSTEM_PROMPT,
        prompt,
        temperature: this.config.temperature,
      });

      const boundaries = object.boundaries;

      const validationError = validateBoundaries(boundaries, params.transcript);
      if (validationError) {
        return Result.fail(
          PipelineError.scenePlanningFailed(validationError)
        );
      }

      return Result.ok(boundaries);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown scene planning error";
      return Result.fail(
        PipelineError.scenePlanningFailed(`Scene planning failed: ${message}`)
      );
    }
  }
}

function formatTranscriptForPlanning(params: {
  transcript: WordTimestamp[];
  fullText: string;
  totalDuration: number;
}): string {
  const wordList = params.transcript
    .map((w) => `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`)
    .join("\n");

  return [
    `Total duration: ${params.totalDuration.toFixed(2)} seconds`,
    `Full text: ${params.fullText}`,
    "",
    "Word-level timestamps:",
    wordList,
  ].join("\n");
}

function validateBoundaries(
  boundaries: SceneBoundary[],
  transcript: WordTimestamp[]
): string | null {
  if (boundaries.length < 2 || boundaries.length > 15) {
    return `Scene count ${boundaries.length} is outside the valid range of 2–15`;
  }

  const validTypes = new Set([
    "Hook", "Analogy", "Bridge", "Architecture",
    "Spotlight", "Comparison", "Power", "CTA",
  ]);
  for (const scene of boundaries) {
    if (!validTypes.has(scene.type)) {
      return `Invalid scene type "${scene.type}" for scene "${scene.name}"`;
    }
  }

  // Check contiguity: no gaps or overlaps
  for (let i = 1; i < boundaries.length; i++) {
    const prev = boundaries[i - 1]!;
    const curr = boundaries[i]!;
    const gap = Math.abs(curr.startTime - prev.endTime);
    if (gap > 0.01) {
      return `Gap or overlap between scene ${prev.id} (end=${prev.endTime}) and scene ${curr.id} (start=${curr.startTime})`;
    }
  }

  // Check coverage of transcript
  if (transcript.length > 0) {
    const firstWord = transcript[0]!;
    const lastWord = transcript[transcript.length - 1]!;
    const firstScene = boundaries[0]!;
    const lastScene = boundaries[boundaries.length - 1]!;

    if (firstScene.startTime > firstWord.start + 0.01) {
      return `First scene starts at ${firstScene.startTime} but first word starts at ${firstWord.start}`;
    }
    if (lastScene.endTime < lastWord.end - 0.01) {
      return `Last scene ends at ${lastScene.endTime} but last word ends at ${lastWord.end}`;
    }
  }

  return null;
}
