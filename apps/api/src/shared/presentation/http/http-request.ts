import type { Request } from "express";

export class HttpRequest {
  constructor(
    public readonly body: unknown,
    public readonly query: Record<string, unknown>,
    public readonly params: Record<string, unknown>,
    public readonly headers: Record<string, unknown>
  ) {}

  static fromExpress(req: Request): HttpRequest {
    return new HttpRequest(req.body, req.query, req.params, req.headers);
  }
}
