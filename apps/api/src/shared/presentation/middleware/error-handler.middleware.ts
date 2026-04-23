import type { Request, Response, NextFunction } from "express";

export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isProduction = process.env["NODE_ENV"] === "production";

  if (!isProduction) {
    console.error("[error-handler]", err);
  }

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: "internal_error",
    message: "Internal server error",
  });
}
