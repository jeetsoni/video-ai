export interface HttpClient {
  get<T>(params: {
    path: string;
    queryParams?: Record<string, string>;
  }): Promise<T>;
  post<T>(params: {
    path: string;
    body: unknown;
    headers?: Record<string, string>;
  }): Promise<T>;
  put<T>(params: { path: string; body: unknown }): Promise<T>;
  delete<T>(params: { path: string; body?: unknown }): Promise<T>;
}
