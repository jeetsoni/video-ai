export interface EnvironmentConfig {
  environment: "local" | "uat" | "prod";
  api: {
    baseUrl: string;
    timeoutMs: number;
  };
  features?: Record<string, boolean>;
}
