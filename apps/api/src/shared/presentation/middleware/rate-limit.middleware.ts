import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { RateLimiter } from "@/shared/domain/interfaces/rate-limiter.js";

type KeyStrategy = "ip" | "browserId" | "both";

interface RateLimitOptions {
  limiter: RateLimiter;
  keyStrategy?: KeyStrategy;
  message?: string;
}

function extractKey(req: Request, strategy: KeyStrategy): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const browserId = req.headers["x-browser-id"] as string | undefined;

  switch (strategy) {
    case "browserId":
      return browserId ?? ip;
    case "both":
      return browserId ? `${browserId}:${ip}` : ip;
    case "ip":
    default:
      return ip;
  }
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): RequestHandler {
  const {
    limiter,
    keyStrategy = "browserId",
    message = "Too many requests. Please try again later.",
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = extractKey(req, keyStrategy);
    const result = await limiter.isAllowed(key);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 0) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
