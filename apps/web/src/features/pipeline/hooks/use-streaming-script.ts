"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneBoundary } from "@video-ai/shared";
import { scriptStreamEventSchema } from "@video-ai/shared";
import { SSEClient } from "@/shared/services/sse-client";

export type StreamingStatus = "loading" | "streaming" | "complete" | "error";

export interface UseStreamingScriptResult {
  script: string;
  scenes: SceneBoundary[];
  status: StreamingStatus;
  error: string | null;
}

/**
 * Hook that connects directly to the SSE stream endpoint for a job.
 *
 * During streaming, builds a display-ready scenes array: completed scenes
 * show their final text, and a synthetic in-progress scene shows the chunk
 * text currently being generated.
 */
export function useStreamingScript(params: {
  jobId: string;
  apiBaseUrl: string;
}): UseStreamingScriptResult {
  const { jobId, apiBaseUrl } = params;

  // Raw chunk text accumulated from all chunk events
  const [chunkText, setChunkText] = useState("");
  // Completed scenes from scene events (with their final text)
  const [completedScenes, setCompletedScenes] = useState<SceneBoundary[]>([]);
  // Track how many characters of chunkText are covered by completed scenes
  const coveredLengthRef = useRef(0);
  const [status, setStatus] = useState<StreamingStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  // Final script from done event (may differ from chunkText)
  const [finalScript, setFinalScript] = useState<string | null>(null);

  const sseClientRef = useRef<SSEClient<unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    coveredLengthRef.current = 0;

    async function startStreaming() {
      const url = `${apiBaseUrl}/api/pipeline/jobs/${jobId}/stream`;
      const client = new SSEClient({
        url,
        parseEvent: (data: string) => scriptStreamEventSchema.parse(JSON.parse(data)),
      });
      sseClientRef.current = client;

      let receivedFirstEvent = false;

      try {
        for await (const event of client.connect()) {
          if (cancelled) return;

          const parsed = event as { type: string; data: Record<string, unknown> };

          if (!receivedFirstEvent) {
            receivedFirstEvent = true;
            if (parsed.type !== "done" && parsed.type !== "error") {
              setStatus("streaming");
            }
          }

          switch (parsed.type) {
            case "chunk": {
              const text = (parsed.data as { text: string }).text;
              setChunkText((prev) => prev + text);
              break;
            }
            case "scene": {
              const scene = parsed.data as unknown as SceneBoundary;
              // Mark how much of the chunk text this scene covers.
              // The scene's text is the authoritative content — advance the
              // covered pointer past it (plus any whitespace separator).
              setChunkText((prev) => {
                const idx = prev.indexOf(scene.text, coveredLengthRef.current);
                if (idx >= 0) {
                  coveredLengthRef.current = idx + scene.text.length;
                } else {
                  // Fallback: just advance by the scene text length
                  coveredLengthRef.current += scene.text.length;
                }
                return prev;
              });
              setCompletedScenes((prev) => [...prev, scene]);
              break;
            }
            case "done": {
              const doneData = parsed.data as unknown as {
                script: string;
                scenes: SceneBoundary[];
              };
              setFinalScript(doneData.script);
              setCompletedScenes(doneData.scenes);
              setStatus("complete");
              return;
            }
            case "error": {
              const errorData = parsed.data as { message: string };
              setStatus("error");
              setError(errorData.message);
              return;
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Stream connection failed"
        );
      }
    }

    startStreaming();

    return () => {
      cancelled = true;
      if (sseClientRef.current) {
        sseClientRef.current.close();
        sseClientRef.current = null;
      }
    };
  }, [jobId, apiBaseUrl]);

  // The script exposed to consumers: final script when done, chunk text while streaming
  const script = finalScript ?? chunkText;

  // Build display scenes: completed scenes + synthetic in-progress scene
  const scenes = useMemo(() => {
    if (status !== "streaming") return completedScenes;

    // Get the chunk text beyond what completed scenes cover
    const remainingText = chunkText.slice(coveredLengthRef.current).trimStart();

    if (!remainingText) return completedScenes;

    // Synthetic in-progress scene for the text currently being generated
    const inProgressScene: SceneBoundary = {
      id: completedScenes.length + 1,
      name: `Scene ${String(completedScenes.length + 1).padStart(2, "0")}`,
      type: "Hook",
      startTime: 0,
      endTime: 0,
      text: remainingText,
    };

    return [...completedScenes, inProgressScene];
  }, [status, completedScenes, chunkText]);

  return { script, scenes, status, error };
}
