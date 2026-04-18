import { TextEncoder, TextDecoder } from "util";

Object.assign(globalThis, { TextEncoder, TextDecoder });

import { SSEClient } from "./sse-client";

interface TestEvent {
  type: string;
  seq: number;
  data: unknown;
}

function createMockReader(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: jest.fn().mockImplementation(() => {
      if (index < chunks.length) {
        const value = encoder.encode(chunks[index]!);
        index++;
        return Promise.resolve({ done: false, value });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
}

function mockFetchResponse(
  reader: ReturnType<typeof createMockReader>,
  status = 200,
  statusText = "OK"
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    body: { getReader: () => reader },
    headers: new Headers({ "Content-Type": "text/event-stream" }),
  } as unknown as Response;
}

const parseEvent = (data: string): TestEvent => JSON.parse(data) as TestEvent;

describe("SSEClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses and yields SSE events from the stream", async () => {
    const sseData = [
      'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"Hello "}}\n\n',
      'event: chunk\nid: 2\ndata: {"type":"chunk","seq":2,"data":{"text":"world"}}\n\n',
      'event: done\nid: 3\ndata: {"type":"done","seq":3,"data":{"script":"Hello world","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "chunk", seq: 1, data: { text: "Hello " } });
    expect(events[1]).toEqual({ type: "chunk", seq: 2, data: { text: "world" } });
    expect(events[2]).toEqual({ type: "done", seq: 3, data: { script: "Hello world", scenes: [] } });
  });

  it("closes connection on done event", async () => {
    const sseData = [
      'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"Hi"}}\n\n',
      'event: done\nid: 2\ndata: {"type":"done","seq":2,"data":{"script":"Hi","scenes":[]}}\n\n',
      'event: chunk\nid: 3\ndata: {"type":"chunk","seq":3,"data":{"text":"should not appear"}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe("done");
  });

  it("closes connection on error event", async () => {
    const sseData = [
      'event: error\nid: 1\ndata: {"type":"error","seq":1,"data":{"code":"fail","message":"oops"}}\n\n',
      'event: chunk\nid: 2\ndata: {"type":"chunk","seq":2,"data":{"text":"should not appear"}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", seq: 1, data: { code: "fail", message: "oops" } });
  });

  it("skips malformed events and continues", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const sseData = [
      'event: chunk\nid: 1\ndata: not-valid-json\n\n',
      'event: chunk\nid: 2\ndata: {"type":"chunk","seq":2,"data":{"text":"valid"}}\n\n',
      'event: done\nid: 3\ndata: {"type":"done","seq":3,"data":{"script":"valid","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("chunk");
    expect(warnSpy).toHaveBeenCalledWith(
      "SSE: malformed event data, skipping:",
      "not-valid-json"
    );

    warnSpy.mockRestore();
  });

  it("skips heartbeat comments", async () => {
    const sseData = [
      ':heartbeat\n\n',
      'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"Hi"}}\n\n',
      ':heartbeat\n\n',
      'event: done\nid: 2\ndata: {"type":"done","seq":2,"data":{"script":"Hi","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
  });

  it("retries on unexpected disconnect with exponential backoff", async () => {
    let callCount = 0;

    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error("Connection lost"));
      }
      const sseData = [
        'event: done\nid: 1\ndata: {"type":"done","seq":1,"data":{"script":"ok","scenes":[]}}\n\n',
      ];
      return Promise.resolve(mockFetchResponse(createMockReader(sseData)));
    });

    const client = new SSEClient({
      url: "/test",
      parseEvent,
      maxRetries: 3,
      retryDelayMs: 10,
    });

    const events: TestEvent[] = [];
    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(callCount).toBe(3);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
  });

  it("throws after exhausting retries", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Connection lost"));

    const client = new SSEClient({
      url: "/test",
      parseEvent,
      maxRetries: 2,
      retryDelayMs: 10,
    });

    await expect(async () => {
      for await (const _event of client.connect()) {
        // should not yield
      }
    }).rejects.toThrow("Connection lost");

    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("throws on non-OK HTTP response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader([]), 500, "Internal Server Error")
    );

    const client = new SSEClient({
      url: "/test",
      parseEvent,
      maxRetries: 0,
    });

    await expect(async () => {
      for await (const _event of client.connect()) {
        // should not yield
      }
    }).rejects.toThrow("SSE connection failed: 500 Internal Server Error");
  });

  it("close() aborts the connection", async () => {
    let resolveRead: (() => void) | null = null;

    const mockReader = {
      read: jest.fn().mockImplementation(() => {
        return new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
          resolveRead = () => resolve({ done: true });
        });
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse(mockReader));

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    const iterationPromise = (async () => {
      for await (const event of client.connect()) {
        events.push(event);
      }
    })();

    await new Promise((r) => setTimeout(r, 10));

    client.close();
    resolveRead?.();

    await iterationPromise;
    expect(events).toHaveLength(0);
  });

  it("handles events split across multiple chunks", async () => {
    const sseData = [
      'event: chunk\nid: 1\ndata: {"type":"chu',
      'nk","seq":1,"data":{"text":"split"}}\n\nevent: done\nid: 2\n',
      'data: {"type":"done","seq":2,"data":{"script":"split","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "chunk", seq: 1, data: { text: "split" } });
    expect(events[1]).toEqual({ type: "done", seq: 2, data: { script: "split", scenes: [] } });
  });

  it("uses default config values", async () => {
    const sseData = [
      'event: done\nid: 1\ndata: {"type":"done","seq":1,"data":{"script":"ok","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(createMockReader(sseData))
    );

    const client = new SSEClient({ url: "/test", parseEvent });
    const events: TestEvent[] = [];

    for await (const event of client.connect()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
  });
});
