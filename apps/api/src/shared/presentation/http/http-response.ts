import type { Response } from "express";

export class HttpResponse {
  constructor(private readonly res: Response) {}

  ok(data: unknown): void {
    this.res.status(200).json(data);
  }

  created(data: unknown): void {
    this.res.status(201).json(data);
  }

  noContent(): void {
    this.res.status(204).send();
  }

  badRequest(error: unknown): void {
    this.res.status(400).json(error);
  }

  unauthorized(error: unknown): void {
    this.res.status(401).json(error);
  }

  forbidden(error: unknown): void {
    this.res.status(403).json(error);
  }

  notFound(error: unknown): void {
    this.res.status(404).json(error);
  }

  conflict(error: unknown): void {
    this.res.status(409).json(error);
  }

  serverError(error: unknown): void {
    this.res.status(500).json(error);
  }

  static fromExpress(res: Response): HttpResponse {
    return new HttpResponse(res);
  }
}
