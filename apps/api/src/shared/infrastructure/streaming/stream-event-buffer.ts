import type { Redis } from "ioredis";
import type { StreamEventBuffer } from "./interfaces.js";

export class RedisStreamEventBuffer implements StreamEventBuffer {
  constructor(private readonly redis: Redis) {}

  async getAll(bufferKey: string): Promise<string[]> {
    return this.redis.lrange(bufferKey, 0, -1);
  }

  async isComplete(bufferKey: string): Promise<boolean> {
    const exists = await this.redis.exists(`${bufferKey}:complete`);
    return exists === 1;
  }
}
