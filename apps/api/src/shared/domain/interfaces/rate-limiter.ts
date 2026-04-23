export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimiter {
  isAllowed(key: string): RateLimitResult | Promise<RateLimitResult>;
}
