import type { HttpClient } from "../interfaces/http-client";
import type { ConfigClient } from "../interfaces/config-client";

export class FetchHttpServiceAdapter implements HttpClient {
  constructor(private readonly configService: ConfigClient) {}

  async get<T>(params: {
    path: string;
    queryParams?: Record<string, string>;
  }): Promise<T> {
    const url = this.buildUrl(params.path, params.queryParams);
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async post<T>(params: {
    path: string;
    body: unknown;
    headers?: Record<string, string>;
  }): Promise<T> {
    const url = this.buildUrl(params.path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify(params.body),
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async put<T>(params: { path: string; body: unknown }): Promise<T> {
    const url = this.buildUrl(params.path);
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.body),
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async delete<T>(params: { path: string; body?: unknown }): Promise<T> {
    const url = this.buildUrl(params.path);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  private buildUrl(
    path: string,
    queryParams?: Record<string, string>
  ): string {
    const baseUrl = this.configService.getApiBaseUrl();
    const url = new URL(path, baseUrl);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.set(key, value)
      );
    }
    return url.toString();
  }
}
