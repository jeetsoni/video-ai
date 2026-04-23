import type { Redis } from "ioredis";
import type {
  RateLimiter,
  RateLimitResult,
} from "@/shared/domain/interfaces/rate-limiter.js";

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;

  constructor(
    redis: Redis,
    maxRequests: number,
    windowMs: number,
    keyPrefix = "rl",
  ) {
    this.redis = redis;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const redisKey = `${this.keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      const results = await this.redis
        .pipeline()
        .zremrangebyscore(redisKey, 0, windowStart)
        .zcard(redisKey)
        .exec();

      const currentCount = (results?.[1]?.[1] as number) ?? 0;

      if (currentCount < this.maxRequests) {
        await this.redis
          .pipeline()
          .zadd(redisKey, now, `${now}:${Math.random()}`)
          .pexpire(redisKey, this.windowMs)
          .exec();

        return { allowed: true };
      }

      const oldest = await this.redis.zrangebyscore(
        redisKey,
        windowStart,
        "+inf",
        "LIMIT",
        0,
        1,
      );

      if (oldest.length > 0) {
        const oldestTimestamp = parseInt(oldest[0]!.split(":")[0]!, 10);
        const retryAfterMs = oldestTimestamp + this.windowMs - now;
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
      }

      return { allowed: false, retryAfterMs: this.windowMs };
    } catch {
      // Fail open — if Redis is down, don't block real users (hackathon judges)
      return { allowed: true };
    }
  }
}
