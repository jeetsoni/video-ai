import type { EnvironmentConfig } from "./environment.types";

function getApiBaseUrl(): string {
  // NEXT_PUBLIC_ vars are inlined at build time by Next.js
  if (process.env["NEXT_PUBLIC_API_URL"]) {
    return process.env["NEXT_PUBLIC_API_URL"];
  }
  // Fallback: detect production by checking if we're on a Railway domain
  if (
    typeof window !== "undefined" &&
    window.location.hostname.includes("railway.app")
  ) {
    return "https://video-ai-production.up.railway.app";
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
