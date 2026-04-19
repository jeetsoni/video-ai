import { jest } from "@jest/globals";
import { BullMQQueueService } from "./queue-service.js";
import type { Queue } from "bullmq";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

function createMockQueue(addFn?: AnyMockFn): Queue {
  return {
    add: addFn ?? (jest.fn() as AnyMockFn).mockResolvedValue({}),
  } as unknown as Queue;
}

describe("BullMQQueueService", () => {
  it("enqueues a processing stage with correct retry config", async () => {
    const addFn = (jest.fn() as AnyMockFn).mockResolvedValue({});
    const queue = createMockQueue(addFn);
    const service = new BullMQQueueService(queue);

    const result = await service.enqueue({
      stage: "script_generation",
      jobId: "job-123",
    });

    expect(result.isSuccess).toBe(true);
    expect(addFn).toHaveBeenCalledWith(
      "script_generation",
      { jobId: "job-123" },
      {
        jobId: expect.stringMatching(/^job-123--script_generation--\d+$/),
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      }
    );
  });

  it("applies stage-specific retry config for tts_generation", async () => {
    const addFn = (jest.fn() as AnyMockFn).mockResolvedValue({});
    const queue = createMockQueue(addFn);
    const service = new BullMQQueueService(queue);

    await service.enqueue({ stage: "tts_generation", jobId: "job-456" });

    expect(addFn).toHaveBeenCalledWith(
      "tts_generation",
      { jobId: "job-456" },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
      })
    );
  });

  it("returns failure for non-processing stage script_review", async () => {
    const queue = createMockQueue();
    const service = new BullMQQueueService(queue);

    const result = await service.enqueue({
      stage: "script_review",
      jobId: "job-789",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("not a processing stage");
  });

  it("returns failure for non-processing stage done", async () => {
    const queue = createMockQueue();
    const service = new BullMQQueueService(queue);

    const result = await service.enqueue({
      stage: "done",
      jobId: "job-def",
    });

    expect(result.isFailure).toBe(true);
  });

  it("returns failure when queue.add throws", async () => {
    const addFn = (jest.fn() as AnyMockFn).mockRejectedValue(new Error("Redis connection lost"));
    const queue = createMockQueue(addFn);
    const service = new BullMQQueueService(queue);

    const result = await service.enqueue({
      stage: "rendering",
      jobId: "job-err",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("Redis connection lost");
  });
});
