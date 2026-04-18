import type { WordTimestamp, SceneBoundary } from "@video-ai/shared";
import type { TimestampMapper } from "@/pipeline/application/interfaces/timestamp-mapper.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class TextTimestampMapper implements TimestampMapper {
  mapTimestamps(params: {
    scenes: SceneBoundary[];
    transcript: WordTimestamp[];
  }): Result<SceneBoundary[], PipelineError> {
    const { scenes, transcript } = params;

    if (scenes.length === 0) {
      return Result.fail(
        PipelineError.timestampMappingFailed("No scenes provided")
      );
    }

    if (transcript.length === 0) {
      return Result.fail(
        PipelineError.timestampMappingFailed("No transcript words provided")
      );
    }

    let transcriptIndex = 0;
    const mappedScenes: SceneBoundary[] = [];

    for (const scene of scenes) {
      const sceneWords = scene.text
        .split(/\s+/)
        .map(normalizeWord)
        .filter((w) => w.length > 0);

      if (sceneWords.length === 0) {
        return Result.fail(
          PipelineError.timestampMappingFailed(
            `Scene "${scene.name}" (id=${scene.id}) has no matchable words`
          )
        );
      }

      const firstWordIndex = transcriptIndex;

      for (const sceneWord of sceneWords) {
        if (transcriptIndex >= transcript.length) {
          return Result.fail(
            PipelineError.timestampMappingFailed(
              `Ran out of transcript words while matching scene "${scene.name}" (id=${scene.id}). ` +
                `Expected word "${sceneWord}" but transcript has no more words.`
            )
          );
        }

        const transcriptWord = normalizeWord(transcript[transcriptIndex]!.word);

        if (transcriptWord !== sceneWord) {
          return Result.fail(
            PipelineError.timestampMappingFailed(
              `Word mismatch at transcript position ${transcriptIndex}: ` +
                `expected "${sceneWord}" (scene "${scene.name}") but found "${transcriptWord}"`
            )
          );
        }

        transcriptIndex++;
      }

      const lastWordIndex = transcriptIndex - 1;

      mappedScenes.push({
        ...scene,
        startTime: transcript[firstWordIndex]!.start,
        endTime: transcript[lastWordIndex]!.end,
      });
    }

    // Adjust boundaries to be contiguous
    for (let i = 0; i < mappedScenes.length - 1; i++) {
      mappedScenes[i] = {
        ...mappedScenes[i]!,
        endTime: mappedScenes[i + 1]!.startTime,
      };
    }

    // First scene starts at or before the first transcript word
    const firstTranscriptStart = transcript[0]!.start;
    mappedScenes[0] = {
      ...mappedScenes[0]!,
      startTime: Math.min(mappedScenes[0]!.startTime, firstTranscriptStart),
    };

    // Last scene ends at or after the last transcript word
    const lastTranscriptEnd = transcript[transcript.length - 1]!.end;
    const lastIdx = mappedScenes.length - 1;
    mappedScenes[lastIdx] = {
      ...mappedScenes[lastIdx]!,
      endTime: Math.max(mappedScenes[lastIdx]!.endTime, lastTranscriptEnd),
    };

    return Result.ok(mappedScenes);
  }
}
