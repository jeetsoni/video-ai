import type { ConfigClient } from "../interfaces/config-client";
import { defaultConfig } from "../config/default";

export class AppConfigServiceAdapter implements ConfigClient {
  getApiBaseUrl(): string {
    return defaultConfig.api.baseUrl;
  }

  getApiPath(feature: string, endpoint: string): string {
    return `${this.getApiBaseUrl()}/${feature}/${endpoint}`;
  }

  getEnvironment(): "local" | "uat" | "prod" {
    return defaultConfig.environment;
  }
}
