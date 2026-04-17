import type { EnvironmentConfig } from "./environment.types";

export const defaultConfig: EnvironmentConfig = {
  environment: "local",
  api: {
    baseUrl: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000",
    timeoutMs: 10000,
  },
};
