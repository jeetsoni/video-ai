import type { Request, Response, NextFunction } from "express";
import type { InMemoryRateLimiter } from "@/shared/infrastructure/rate-limiter/in-memory-rate-limiter.js";

export function createRateLimitMiddleware(limiter: InMemoryRateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const { allowed, retryAfterMs } = limiter.isAllowed(key);

    if (!allowed) {
      const retryAfterSeconds = Math.ceil((retryAfterMs ?? 0) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: "Too many preview requests. Try again later.",
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
