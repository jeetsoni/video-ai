import type { Request, Response } from "express";
import type {
  StreamEventSubscriber,
  StreamEventBuffer,
  SSEResponseHelper,
} from "@/shared/infrastructure/streaming/interfaces.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import { isTerminalStatus, type ProgressEvent } from "@video-ai/shared";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEARTBEAT_INTERVAL_MS = 15_000;

export class ProgressController {
  private seq = 0;

  constructor(
    private readonly subscriber: StreamEventSubscriber,
    private readonly sseHelper: SSEResponseHelper,
    private readonly jobRepository: PipelineJobRepository,
    private readonly buffer: StreamEventBuffer,
  ) {}

  async streamProgress(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(400).json({
        error: "INVALID_INPUT",
        message: "Job ID must be a valid UUID",
      });
      return;
    }

    const job = await this.jobRepository.findById(id);
    if (!job) {
      res
        .status(404)
        .json({ error: "NOT_FOUND", message: `Job ${id} not found` });
      return;
    }

    this.sseHelper.initSSE(res);

    const progressEvent = this.buildProgressEvent(
      job.stage.value,
      job.status.value,
      job.progressPercent,
      job.error?.code,
      job.error?.message,
    );

    this.sseHelper.sendEvent(res, {
      type: "progress",
      data: progressEvent,
      id: String(progressEvent.seq),
    });

    if (isTerminalStatus(job.status.value)) {
      res.end();
      return;
    }

    // Replay buffered scene progress events on reconnect during code_generation
    if (job.stage.value === "code_generation") {
      const bufferKey = `stream:buffer:scene-progress:${id}`;
      const bufferedEvents = await this.buffer.getAll(bufferKey);

      for (const raw of bufferedEvents) {
        const parsed = JSON.parse(raw);
        this.sseHelper.sendEvent(res, {
          type: "progress",
          data: parsed,
        });
      }
    }

    const channel = `stream:progress:${id}`;

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

    await this.subscriber.subscribe(channel, (message: string) => {
      try {
        const parsed = JSON.parse(message) as ProgressEvent;
        this.sseHelper.sendEvent(res, {
          type: "progress",
          data: parsed,
          id: String(parsed.seq),
        });

        if (isTerminalStatus(parsed.data.status)) {
          cleanup();
          res.end();
        }
      } catch {
        // Skip malformed messages
      }
    });

    req.on("close", () => {
      cleanup();
    });
  }

  private buildProgressEvent(
    stage: string,
    status: string,
    progressPercent: number,
    errorCode?: string,
    errorMessage?: string,
  ): ProgressEvent {
    const event: ProgressEvent = {
      type: "progress",
      seq: this.seq++,
      data: {
        stage: stage as ProgressEvent["data"]["stage"],
        status: status as ProgressEvent["data"]["status"],
        progressPercent,
      },
    };

    if (errorCode) {
      event.data.errorCode = errorCode;
    }
    if (errorMessage) {
      event.data.errorMessage = errorMessage;
    }

    return event;
  }
}
