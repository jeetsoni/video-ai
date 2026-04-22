"use client";

import { useMemo, useRef, useEffect } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { SceneBoundary, SceneProgressInfo } from "@video-ai/shared";
import { cn } from "@/shared/lib/utils";
import { evaluateComponentCode } from "../utils/code-evaluator";
import { CheckCircle2, Loader2, Circle } from "lucide-react";

interface ProgressiveScenePreviewProps {
  sceneBoundaries: SceneBoundary[];
  completedSceneCodes: Map<number, string>;
  sceneProgress: Map<number, SceneProgressInfo>;
  format: string;
  themeBackground?: string;
  /** Called with the Remotion PlayerRef once the player mounts, so external controls can drive it. */
  onPlayerRef?: (ref: PlayerRef | null) => void;
  /** Total frames for the current composition — reported back so external controls know the duration. */
  onTotalFrames?: (frames: number) => void;
  /** Hide the scene progress indicator (render it externally instead). */
  hideProgressIndicator?: boolean;
}

const FPS = 30;

const ASPECT_CLASSES: Record<string, string> = {
  reel: "aspect-[9/16]",
  short: "aspect-[9/16]",
  longform: "aspect-[16/9]",
};

/**
 * Strip import/export statements from AI-generated code.
 * new Function() doesn't support ES module syntax.
 */
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

/**
 * Compose available scene codes into a single renderable component.
 * Each scene code defines `function Main({ scene })` — we rename them
 * and wrap in Sequences for correct timing.
 */
function composePartialScenes(
  sceneBoundaries: SceneBoundary[],
  completedSceneCodes: Map<number, string>,
  themeBackground: string,
): string | null {
  const availableCodes: {
    code: string;
    boundary: SceneBoundary;
    index: number;
  }[] = [];

  for (let i = 0; i < sceneBoundaries.length; i++) {
    const boundary = sceneBoundaries[i]!;
    const rawCode = completedSceneCodes.get(boundary.id);
    if (rawCode) {
      // Strip module statements before composing
      const code = stripModuleStatements(rawCode);
      availableCodes.push({ code, boundary, index: i });
    }
  }

  if (availableCodes.length === 0) return null;

  // Rename each scene's Main to SceneN
  const renamedScenes = availableCodes.map(({ code, index }) => {
    return code.replace(
      /function\s+Main\s*\(\s*\{\s*scene\s*\}\s*\)/,
      `function Scene${index + 1}({ scene })`,
    );
  });

  const sceneImports = renamedScenes.join("\n\n");

  // Build Sequence elements for each available scene
  const sceneRenderers = availableCodes
    .map(({ boundary, index }) => {
      const startFrame = Math.round(boundary.startTime * FPS);
      const endFrame = Math.round(boundary.endTime * FPS);
      const durationFrames = endFrame - startFrame;
      return `      React.createElement(Sequence, { key: ${boundary.id}, from: ${startFrame}, durationInFrames: ${durationFrames} },
        React.createElement(Scene${index + 1}, { scene: scenePlan.scenes[${index}] })
      )`;
    })
    .join(",\n");

  return `${sceneImports}

function Main({ scenePlan }) {
  return React.createElement(AbsoluteFill, { style: { backgroundColor: "${themeBackground}" } },
${sceneRenderers}
  );
}`;
}

function SceneProgressIndicator({
  scenes,
  sceneProgress,
  completedSceneCodes,
}: {
  scenes: SceneBoundary[];
  sceneProgress: Map<number, SceneProgressInfo>;
  completedSceneCodes: Map<number, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
        Generating Scenes ({completedSceneCodes.size}/{scenes.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {scenes.map((scene) => {
          const progress = sceneProgress.get(scene.id);
          const isCompleted = completedSceneCodes.has(scene.id);
          const isGenerating = progress?.status === "generating";

          return (
            <div
              key={scene.id}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                isCompleted && "bg-stage-complete/15 text-stage-complete",
                isGenerating && "bg-stage-active/15 text-stage-active",
                !isCompleted &&
                  !isGenerating &&
                  "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {isCompleted && <CheckCircle2 className="size-3" />}
              {isGenerating && <Loader2 className="size-3 animate-spin" />}
              {!isCompleted && !isGenerating && <Circle className="size-3" />}
              <span>{scene.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { SceneProgressIndicator };

export function ProgressiveScenePreview({
  sceneBoundaries,
  completedSceneCodes,
  sceneProgress,
  format,
  themeBackground = "#0F1117",
  onPlayerRef,
  onTotalFrames,
  hideProgressIndicator = false,
}: ProgressiveScenePreviewProps) {
  const playerRef = useRef<PlayerRef | null>(null);

  // Report playerRef to parent so external OverlayControls can drive it
  useEffect(() => {
    onPlayerRef?.(playerRef.current);
    return () => onPlayerRef?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compose available scene codes into a renderable component
  const { component, totalFrames, scenePlan } = useMemo(() => {
    const composedCode = composePartialScenes(
      sceneBoundaries,
      completedSceneCodes,
      themeBackground,
    );

    if (!composedCode) {
      return { component: null, totalFrames: 0, scenePlan: null };
    }

    const result = evaluateComponentCode(composedCode);
    const lastScene = sceneBoundaries[sceneBoundaries.length - 1];
    const frames = lastScene ? Math.round(lastScene.endTime * FPS) : 150;

    // Build a minimal scenePlan with scene directions for the player
    // Each scene component receives its scene object — we construct minimal ones
    const scenes = sceneBoundaries.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      description: "",
      startTime: b.startTime,
      endTime: b.endTime,
      startFrame: Math.round(b.startTime * FPS),
      endFrame: Math.round(b.endTime * FPS),
      durationFrames:
        Math.round(b.endTime * FPS) - Math.round(b.startTime * FPS),
      text: b.text,
      words: [],
      animationDirection: {
        colorAccent: "#1DB9AE",
        mood: "",
        layout: "",
        beats: [],
      },
    }));

    const plan = {
      title: "",
      totalDuration: lastScene ? lastScene.endTime : 5,
      fps: 30 as const,
      totalFrames: frames,
      designSystem: {
        background: themeBackground,
        surface: "#161B25",
        raised: "#1E2535",
        textPrimary: "#EEF2FF",
        textMuted: "#6B7FA0",
        accents: {
          hookFear: "#D96B6B",
          wrongPath: "#D4924A",
          techCode: "#1DB9AE",
          revelation: "#5ECFB0",
          cta: "#A8E6D8",
          violet: "#7B8FCC",
        },
      },
      scenes,
    };

    return {
      component: result.component,
      totalFrames: frames,
      scenePlan: plan,
    };
  }, [sceneBoundaries, completedSceneCodes, themeBackground]);

  // Report totalFrames to parent whenever it changes
  useEffect(() => {
    if (totalFrames > 0) onTotalFrames?.(totalFrames);
  }, [totalFrames, onTotalFrames]);

  // Once the player mounts, report the ref to the parent
  const handleRef = (ref: PlayerRef | null) => {
    playerRef.current = ref;
    onPlayerRef?.(ref);
  };

  // Create a wrapper component for the Player
  const PlayerComponent = useMemo(() => {
    if (!component || !scenePlan) return null;
    const Comp = component;
    const plan = scenePlan;
    return function ProgressiveComposition() {
      return <Comp scenePlan={plan} />;
    };
  }, [component, scenePlan]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Scene progress indicators */}
      {!hideProgressIndicator && (
        <SceneProgressIndicator
          scenes={sceneBoundaries}
          sceneProgress={sceneProgress}
          completedSceneCodes={completedSceneCodes}
        />
      )}

      {/* Progressive Remotion preview */}
      {PlayerComponent && totalFrames > 0 ? (
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-2xl",
            ASPECT_CLASSES[format] ?? "aspect-video",
          )}
        >
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 glass rounded-lg px-2.5 py-1">
            <Loader2 className="size-3 animate-spin text-stage-active" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stage-active">
              Live — {completedSceneCodes.size}/{sceneBoundaries.length} scenes
            </span>
          </div>
          <Player
            ref={handleRef}
            component={PlayerComponent}
            inputProps={{}}
            durationInFrames={Math.max(1, totalFrames)}
            fps={30}
            compositionWidth={1080}
            compositionHeight={1920}
            numberOfSharedAudioTags={40}
            style={{ width: "100%", maxHeight: "70vh" }}
          />
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[250px] rounded-2xl bg-surface-container-high flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center p-8">
            <Loader2 className="size-6 animate-spin text-stage-active" />
            <p className="text-sm text-on-surface-variant">
              Generating scene animations…
            </p>
            <p className="text-xs text-on-surface-variant/60">
              Preview will appear as each scene completes
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
