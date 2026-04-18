import type { Response } from "express";
import type { SSEResponseHelper } from "./interfaces.js";

export class ExpressSSEResponseHelper implements SSEResponseHelper {
  initSSE(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  sendEvent(
    res: Response,
    event: { type: string; data: unknown; id?: string },
  ): void {
    res.write(`event: ${event.type}\n`);
    if (event.id !== undefined) {
      res.write(`id: ${event.id}\n`);
    }
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }

  sendHeartbeat(res: Response): void {
    res.write(`:heartbeat\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }
}
