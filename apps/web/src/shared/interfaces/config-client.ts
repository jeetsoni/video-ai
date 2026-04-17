export interface ConfigClient {
  getApiBaseUrl(): string;
  getApiPath(feature: string, endpoint: string): string;
  getEnvironment(): "local" | "uat" | "prod";
}
