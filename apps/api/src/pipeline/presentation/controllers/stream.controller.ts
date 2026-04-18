import type { Request, Response } from "express";
import type { StreamEventBuffer, StreamEventSubscriber, SSEResponseHelper } from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEARTBEAT_INTERVAL_MS = 15_000;

export class StreamController {
  constructor(
    private readonly buffer: StreamEventBuffer,
    private readonly subscriber: StreamEventSubscriber,
    private readonly sseHelper: SSEResponseHelper,
    private readonly jobRepository: PipelineJobRepository,
  ) {}

  async streamScriptGeneration(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Job ID must be a valid UUID" });
      return;
    }

    const job = await this.jobRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: "NOT_FOUND", message: `Job ${id} not found` });
      return;
    }

    const channel = `stream:script:${id}`;
    const bufferKey = `stream:buffer:script:${id}`;

    // Failed job — send error event and close
    if (job.status.value === "failed") {
      this.sseHelper.initSSE(res);
      const errorData = job.error
        ? { code: job.error.code, message: job.error.message }
        : { code: "unknown_error", message: "Job failed" };
      this.sseHelper.sendEvent(res, {
        type: "error",
        data: { type: "error", seq: 0, data: errorData },
        id: "0",
      });
      res.end();
      return;
    }

    // Job is past script_generation (script_review or later, index >= 1)
    if (job.stage.indexOf() >= 1) {
      this.sseHelper.initSSE(res);
      const complete = await this.buffer.isComplete(bufferKey);

      if (complete) {
        // Replay done event from buffer (last event)
        const events = await this.buffer.getAll(bufferKey);
        const lastEvent = events[events.length - 1];
        if (lastEvent) {
          const parsed = JSON.parse(lastEvent);
          this.sseHelper.sendEvent(res, {
            type: parsed.type,
            data: parsed,
            id: String(parsed.seq),
          });
        }
      } else {
        // Buffer expired — synthesize done event from DB
        const doneEvent = {
          type: "done",
          seq: 0,
          data: { script: job.generatedScript, scenes: job.generatedScenes },
        };
        this.sseHelper.sendEvent(res, {
          type: "done",
          data: doneEvent,
          id: "0",
        });
      }

      res.end();
      return;
    }

    // Job is in script_generation (processing) — stream live
    this.sseHelper.initSSE(res);

    // Start heartbeat
    const heartbeatInterval = setInterval(() => {
      this.sseHelper.sendHeartbeat(res);
    }, HEARTBEAT_INTERVAL_MS);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeatInterval);
      void this.subscriber.unsubscribe(channel);
    };

    // Replay buffered events, then subscribe to Pub/Sub
    const bufferedEvents = await this.buffer.getAll(bufferKey);

    for (const raw of bufferedEvents) {
      const parsed = JSON.parse(raw);
      this.sseHelper.sendEvent(res, {
        type: parsed.type,
        data: parsed,
        id: String(parsed.seq),
      });

      // If buffer already contains done/error, close immediately
      if (parsed.type === "done" || parsed.type === "error") {
        cleanup();
        res.end();
        return;
      }
    }

    // Subscribe to live events
    await this.subscriber.subscribe(channel, (message: string) => {
      try {
        const parsed = JSON.parse(message);
        this.sseHelper.sendEvent(res, {
          type: parsed.type,
          data: parsed,
          id: String(parsed.seq),
        });

        if (parsed.type === "done" || parsed.type === "error") {
          cleanup();
          res.end();
        }
      } catch {
        // Skip malformed messages
      }
    });

    // Clean up on client disconnect
    req.on("close", () => {
      cleanup();
    });
  }
}
