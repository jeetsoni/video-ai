import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { FORMAT_RESOLUTIONS, ALL_SFX_FILENAMES } from "@video-ai/shared";
import type { ScenePlan, VideoFormat } from "@video-ai/shared";
import type { VideoRenderer } from "@/pipeline/application/interfaces/video-renderer.js";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RemotionVideoRendererConfig {
  compositionId: string;
  fps: number;
  codec: "h264";
  audioCodec: "aac";
}

const DEFAULT_CONFIG: RemotionVideoRendererConfig = {
  compositionId: "Main",
  fps: 30,
  codec: "h264",
  audioCodec: "aac",
};

const FPS = 30;

/**
 * Builds a minimal Remotion entry file that registers the generated component
 * as a composition. This is what Remotion's bundler needs as an entry point.
 */
function buildEntrySource(
  code: string,
  scenePlan: ScenePlan,
  resolution: { width: number; height: number },
  audioFileName: string,
): string {
  return [
    `import React, { useState, useEffect, useMemo, useCallback } from "react";`,
    `import { registerRoot, Composition, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Audio, staticFile } from "remotion";`,
    ``,
    `// --- Generated component code (inlined) ---`,
    code,
    `// --- End generated component ---`,
    ``,
    `// Wrapper that adds voiceover audio to the generated animation`,
    `const MainWithAudio: React.FC<{ scenePlan: any }> = ({ scenePlan }) => {`,
    `  return (`,
    `    <AbsoluteFill>`,
    `      <Main scenePlan={scenePlan} />`,
    `      <Audio src={staticFile("${audioFileName}")} />`,
    `    </AbsoluteFill>`,
    `  );`,
    `};`,
    ``,
    `const Root: React.FC = () => {`,
    `  return (`,
    `    <Composition`,
    `      id="Main"`,
    `      component={MainWithAudio}`,
    `      durationInFrames={${scenePlan.totalFrames}}`,
    `      fps={${FPS}}`,
    `      width={${resolution.width}}`,
    `      height={${resolution.height}}`,
    `      defaultProps={{ scenePlan: ${JSON.stringify(scenePlan)} }}`,
    `    />`,
    `  );`,
    `};`,
    ``,
    `registerRoot(Root);`,
  ].join("\n");
}

export class RemotionVideoRenderer implements VideoRenderer {
  private readonly config: RemotionVideoRendererConfig;
  private readonly objectStore: ObjectStore;

  constructor(
    objectStore: ObjectStore,
    config?: Partial<RemotionVideoRendererConfig>,
  ) {
    this.objectStore = objectStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async render(params: {
    code: string;
    scenePlan: ScenePlan;
    audioPath: string;
    format: VideoFormat;
  }): Promise<Result<{ videoPath: string }, PipelineError>> {
    const resolution = FORMAT_RESOLUTIONS[params.format];
    const tmpDir = path.join(os.tmpdir(), `remotion-${crypto.randomUUID()}`);

    try {
      fs.mkdirSync(tmpDir, { recursive: true });

      // 1. Download the voiceover audio from object store to temp directory
      const audioSignedUrlResult = await this.objectStore.getSignedUrl(
        params.audioPath,
      );
      if (audioSignedUrlResult.isFailure) {
        return Result.fail(
          PipelineError.renderingFailed(
            `Failed to get audio URL: ${audioSignedUrlResult.getError().message}`,
          ),
        );
      }

      const audioFileName = "voiceover.mp3";
      const publicDir = path.join(tmpDir, "public");
      fs.mkdirSync(publicDir, { recursive: true });
      const localAudioPath = path.join(publicDir, audioFileName);

      const audioResponse = await fetch(audioSignedUrlResult.getValue());
      if (!audioResponse.ok) {
        return Result.fail(
          PipelineError.renderingFailed(
            `Failed to download audio: HTTP ${audioResponse.status}`,
          ),
        );
      }
      const audioArrayBuffer = await audioResponse.arrayBuffer();
      fs.writeFileSync(localAudioPath, Buffer.from(audioArrayBuffer));

      // 2. Stage SFX files into public/sfx/ for staticFile() resolution
      try {
        const sfxDir = path.join(publicDir, "sfx");
        fs.mkdirSync(sfxDir, { recursive: true });

        for (const filename of ALL_SFX_FILENAMES) {
          try {
            const src = path.resolve(
              __dirname,
              "../../../../../../packages/shared/src/sfx/assets",
              filename,
            );
            const dest = path.join(sfxDir, filename);
            fs.copyFileSync(src, dest);
          } catch {
            console.warn(`[SFX staging] Failed to copy ${filename}, skipping`);
          }
        }
      } catch {
        console.warn(
          "[SFX staging] Failed to create sfx directory, proceeding without SFX",
        );
      }

      // 3. Write the Remotion entry file to a temp directory
      const entrySource = buildEntrySource(
        params.code,
        params.scenePlan,
        resolution,
        audioFileName,
      );
      const entryPath = path.join(tmpDir, "index.tsx");
      fs.writeFileSync(entryPath, entrySource, "utf-8");

      // 4. Bundle the entry file with Remotion's webpack bundler
      const bundlePath = await bundle({
        entryPoint: entryPath,
        publicDir,
        onProgress: () => {
          // Bundling progress — no-op for now
        },
      });

      // 5. Select the composition to render
      const composition = await selectComposition({
        serveUrl: bundlePath,
        id: this.config.compositionId,
        inputProps: {
          scenePlan: params.scenePlan,
          audioPath: params.audioPath,
        },
      });

      // 6. Render the video to a temp output file
      const outputPath = path.join(tmpDir, "output.mp4");

      await renderMedia({
        composition: {
          ...composition,
          width: resolution.width,
          height: resolution.height,
          fps: this.config.fps,
          durationInFrames: params.scenePlan.totalFrames,
        },
        serveUrl: bundlePath,
        codec: this.config.codec,
        audioCodec: this.config.audioCodec,
        outputLocation: outputPath,
        inputProps: {
          scenePlan: params.scenePlan,
          audioPath: params.audioPath,
        },
      });

      // 7. Upload the rendered video to object store
      const videoBuffer = fs.readFileSync(outputPath);
      const videoKey = `videos/${crypto.randomUUID()}.mp4`;

      const uploadResult = await this.objectStore.upload({
        key: videoKey,
        data: videoBuffer,
        contentType: "video/mp4",
      });

      if (uploadResult.isFailure) {
        return Result.fail(
          PipelineError.renderingFailed(
            `Failed to upload rendered video: ${uploadResult.getError().message}`,
          ),
        );
      }

      return Result.ok({ videoPath: uploadResult.getValue() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown rendering error";
      return Result.fail(
        PipelineError.renderingFailed(`Video rendering failed: ${message}`),
      );
    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
