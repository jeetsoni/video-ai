import { TextEncoder, TextDecoder } from "util";

Object.assign(globalThis, { TextEncoder, TextDecoder });

import { renderHook, waitFor } from "@testing-library/react";
import { useStreamingScript } from "./use-streaming-script";

// --- helpers ---

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

function mockFetchSSE(reader: ReturnType<typeof createMockReader>): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: { getReader: () => reader },
    headers: new Headers({ "Content-Type": "text/event-stream" }),
  } as unknown as Response;
}

describe("useStreamingScript", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("streams chunk and scene events then completes on done", async () => {
    const sseData = [
      'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"Hello "}}\n\n',
      'event: chunk\nid: 2\ndata: {"type":"chunk","seq":2,"data":{"text":"world"}}\n\n',
      'event: scene\nid: 3\ndata: {"type":"scene","seq":3,"data":{"id":1,"name":"Hook","type":"Hook","startTime":0,"endTime":0,"text":"Hello world"}}\n\n',
      'event: done\nid: 4\ndata: {"type":"done","seq":4,"data":{"script":"Hello world","scenes":[{"id":1,"name":"Hook","type":"Hook","startTime":0,"endTime":0,"text":"Hello world"}]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchSSE(createMockReader(sseData))
    );

    const { result } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost:3001" })
    );

    await waitFor(() => expect(result.current.status).toBe("complete"));

    expect(result.current.script).toBe("Hello world");
    expect(result.current.scenes).toHaveLength(1);
    expect(result.current.scenes[0]!.name).toBe("Hook");
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/pipeline/jobs/job-1/stream",
      expect.objectContaining({ headers: { Accept: "text/event-stream" } })
    );
  });

  it("sets error status on SSE error event", async () => {
    const sseData = [
      'event: error\nid: 1\ndata: {"type":"error","seq":1,"data":{"code":"script_generation_failed","message":"LLM timeout"}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchSSE(createMockReader(sseData))
    );

    const { result } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("LLM timeout");
  });

  it("sets error status when SSE connection fails", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      body: null,
      headers: new Headers(),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    // SSE client retries 3 times with exponential backoff before failing
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 15000 });
    expect(result.current.error).toContain("500");
  }, 20000);

  it("accumulates chunks incrementally during streaming", async () => {
    const sseData = [
      'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"A"}}\n\n',
      'event: chunk\nid: 2\ndata: {"type":"chunk","seq":2,"data":{"text":"B"}}\n\n',
      'event: done\nid: 3\ndata: {"type":"done","seq":3,"data":{"script":"AB","scenes":[]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchSSE(createMockReader(sseData))
    );

    const { result } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.script).toBe("AB");
  });

  it("transitions to streaming status on first chunk event", async () => {
    let resolveSecondRead: (() => void) | null = null;
    const encoder = new TextEncoder();
    const firstChunk = 'event: chunk\nid: 1\ndata: {"type":"chunk","seq":1,"data":{"text":"Hi"}}\n\n';

    const mockReader = {
      read: jest.fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode(firstChunk) })
        .mockImplementationOnce(
          () => new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
            resolveSecondRead = () => resolve({ done: true });
          })
        ),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchSSE(mockReader));

    const { result, unmount } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    // Initially loading
    expect(result.current.status).toBe("loading");

    // After first chunk, should be streaming
    await waitFor(() => expect(result.current.status).toBe("streaming"));
    expect(result.current.script).toBe("Hi");

    unmount();
    resolveSecondRead?.();
  });

  it("completes immediately when SSE returns done event (buffered replay)", async () => {
    const sseData = [
      'event: done\nid: 1\ndata: {"type":"done","seq":1,"data":{"script":"Full script","scenes":[{"id":1,"name":"Hook","type":"Hook","startTime":0,"endTime":0,"text":"Full script"}]}}\n\n',
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockFetchSSE(createMockReader(sseData))
    );

    const { result } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.script).toBe("Full script");
    expect(result.current.scenes).toHaveLength(1);
  });

  it("cleans up SSE client on unmount", async () => {
    let resolveRead: (() => void) | null = null;

    const mockReader = {
      read: jest.fn().mockImplementation(
        () =>
          new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
            resolveRead = () => resolve({ done: true });
          })
      ),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchSSE(mockReader));

    const { unmount } = renderHook(() =>
      useStreamingScript({ jobId: "job-1", apiBaseUrl: "http://localhost" })
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    unmount();
    resolveRead?.();
    // No error should be thrown — cleanup is graceful
  });
});
