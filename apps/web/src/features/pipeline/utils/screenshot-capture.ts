import type { RefObject } from "react";
import html2canvas from "html2canvas";

/**
 * Capture the Remotion player container as a base64 PNG string.
 *
 * Returns the raw base64 payload (no `data:image/png;base64,` prefix)
 * or `null` when capture fails for any reason — the caller can
 * proceed without a screenshot (graceful degradation).
 */
export async function capturePlayerScreenshot(
  playerContainerRef: RefObject<HTMLElement | null>,
): Promise<string | null> {
  try {
    const element = playerContainerRef.current;
    if (!element) {
      console.warn("capturePlayerScreenshot: player container ref is null");
      return null;
    }

    const canvas = await html2canvas(element);
    const dataUrl = canvas.toDataURL("image/png");

    // Strip the data-URL prefix so the backend receives raw base64
    const prefix = "data:image/png;base64,";
    if (dataUrl.startsWith(prefix)) {
      return dataUrl.slice(prefix.length);
    }

    return dataUrl;
  } catch (error) {
    console.warn("capturePlayerScreenshot: failed to capture screenshot", error);
    return null;
  }
}
