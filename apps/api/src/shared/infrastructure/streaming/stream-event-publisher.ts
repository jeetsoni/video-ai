import type { Redis } from "ioredis";
import type { StreamEventPublisher } from "./interfaces.js";

export class RedisStreamEventPublisher implements StreamEventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(
    channel: string,
    event: { seq: number; [key: string]: unknown },
  ): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(event));
  }

  async buffer(
    bufferKey: string,
    event: { seq: number; [key: string]: unknown },
  ): Promise<void> {
    await this.redis.rpush(bufferKey, JSON.stringify(event));
  }

  async markComplete(bufferKey: string, ttlSeconds: number): Promise<void> {
    const flagKey = `${bufferKey}:complete`;
    await this.redis.set(flagKey, "1");
    await this.redis.expire(bufferKey, ttlSeconds);
    await this.redis.expire(flagKey, ttlSeconds);
  }
}
