export interface SSEClientConfig<T> {
  url: string;
  parseEvent: (data: string) => T;
  maxRetries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

interface SSEParsedLine {
  event?: string;
  data?: string;
  id?: string;
}

export class SSEClient<T> {
  private readonly url: string;
  private readonly parseEvent: (data: string) => T;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly headers: Record<string, string>;
  private abortController: AbortController | null = null;
  private closed = false;

  constructor(config: SSEClientConfig<T>) {
    this.url = config.url;
    this.parseEvent = config.parseEvent;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.headers = config.headers ?? {};
  }

  async *connect(): AsyncIterable<T> {
    let retries = 0;

    while (!this.closed) {
      try {
        yield* this.consumeStream();
        return;
      } catch (error) {
        if (this.closed) return;

        retries++;
        if (retries > this.maxRetries) {
          throw error;
        }

        const delay = this.retryDelayMs * Math.pow(2, retries - 1);
        await this.sleep(delay);
      }
    }
  }

  close(): void {
    this.closed = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async *consumeStream(): AsyncGenerator<T> {
    this.abortController = new AbortController();

    const response = await fetch(this.url, {
      headers: { Accept: "text/event-stream", ...this.headers },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error("SSE response has no body");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const result = this.processBlock(buffer);
            if (result) yield result.event;
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const result = this.processBlock(block);
          if (!result) continue;

          yield result.event;

          if (result.isTerminal) {
            this.cleanupReader(reader);
            return;
          }
        }
      }
    } catch (error) {
      if (this.closed || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      throw error;
    } finally {
      this.cleanupReader(reader);
    }
  }

  private processBlock(block: string): { event: T; isTerminal: boolean } | null {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(":")) return null;

    const parsed = this.parseSSEBlock(trimmed);
    if (!parsed.data) return null;

    try {
      const event = this.parseEvent(parsed.data);
      const isTerminal = parsed.event === "done" || parsed.event === "error";
      return { event, isTerminal };
    } catch {
      console.warn("SSE: malformed event data, skipping:", parsed.data);
      return null;
    }
  }

  private parseSSEBlock(block: string): SSEParsedLine {
    const result: SSEParsedLine = {};

    for (const line of block.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const field = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      switch (field) {
        case "event":
          result.event = value;
          break;
        case "data":
          result.data = result.data ? `${result.data}\n${value}` : value;
          break;
        case "id":
          result.id = value;
          break;
      }
    }

    return result;
  }

  private cleanupReader(reader: ReadableStreamDefaultReader): void {
    try {
      reader.cancel().catch(() => {});
    } catch {
      // ignore cleanup errors
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
