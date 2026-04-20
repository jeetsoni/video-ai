const STORAGE_KEY = "video-ai-browser-id";

/**
 * Returns a stable UUID for this browser instance.
 * Generated once on first visit and persisted in localStorage.
 */
export function getBrowserId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
