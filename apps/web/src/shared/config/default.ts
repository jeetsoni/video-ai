import type { EnvironmentConfig } from "./environment.types";

function getApiBaseUrl(): string {
  // NEXT_PUBLIC_ vars are inlined at build time by Next.js
  if (process.env["NEXT_PUBLIC_API_URL"]) {
    return process.env["NEXT_PUBLIC_API_URL"];
  }
  // Fallback: detect production by checking if we're on a Railway or custom domain
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (
      hostname.includes("railway.app") ||
      hostname.includes("kalpanaai.video")
    ) {
      return "https://video-ai-production.up.railway.app";
    }
  }
  return "http://localhost:4000";
}

export const defaultConfig: EnvironmentConfig = {
  environment: "local",
  api: {
    baseUrl: getApiBaseUrl(),
    timeoutMs: 10000,
  },
};
