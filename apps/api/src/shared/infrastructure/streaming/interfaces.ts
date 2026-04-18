import type { Response } from "express";

export interface StreamEventPublisher {
  publish(
    channel: string,
    event: { seq: number; [key: string]: unknown },
  ): Promise<void>;
  buffer(
    bufferKey: string,
    event: { seq: number; [key: string]: unknown },
  ): Promise<void>;
  markComplete(bufferKey: string, ttlSeconds: number): Promise<void>;
}

export interface StreamEventSubscriber {
  subscribe(
    channel: string,
    onMessage: (event: string) => void,
  ): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}

export interface StreamEventBuffer {
  getAll(bufferKey: string): Promise<string[]>;
  isComplete(bufferKey: string): Promise<boolean>;
}

export interface SSEResponseHelper {
  initSSE(res: Response): void;
  sendEvent(
    res: Response,
    event: { type: string; data: unknown; id?: string },
  ): void;
  sendHeartbeat(res: Response): void;
}
