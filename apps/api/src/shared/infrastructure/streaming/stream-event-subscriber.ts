import type { Redis } from "ioredis";
import type { StreamEventSubscriber } from "./interfaces.js";

export class RedisStreamEventSubscriber implements StreamEventSubscriber {
  private subscriber: Redis | null = null;

  constructor(private readonly redis: Redis) {}

  async subscribe(
    channel: string,
    onMessage: (event: string) => void,
  ): Promise<void> {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on("message", (_ch: string, message: string) => {
      onMessage(message);
    });
    await this.subscriber.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    const sub = this.subscriber;
    if (!sub) {
      return;
    }
    // Null out immediately to prevent concurrent calls from double-disconnecting
    this.subscriber = null;
    try {
      await sub.unsubscribe(channel);
      sub.disconnect();
    } catch {
      // Ignore errors during cleanup (connection may already be closed)
    }
  }
}
