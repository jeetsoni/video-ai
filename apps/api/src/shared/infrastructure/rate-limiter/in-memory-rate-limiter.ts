export class InMemoryRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly requests: Map<string, number[]> = new Map();

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = this.requests.get(key) ?? [];
    const valid = timestamps.filter((t) => t > windowStart);

    if (valid.length < this.maxRequests) {
      valid.push(now);
      this.requests.set(key, valid);
      return { allowed: true };
    }

    const oldestInWindow = valid[0]!;
    const retryAfterMs = oldestInWindow + this.windowMs - now;

    this.requests.set(key, valid);
    return { allowed: false, retryAfterMs };
  }
}
