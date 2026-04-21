/**
 * Property-Based Tests for ScriptTweakMessage repository behavior
 *
 * Uses an in-memory implementation that mirrors PrismaScriptTweakMessageRepository's
 * sorting and limiting behavior to test properties without a real database.
 *
 * **Validates: Requirements 4.4, 5.1, 6.5, 9.1, 9.2**
 */
import fc from "fast-check";
import type { ScriptTweakMessage } from "@prisma/client";
import type {
  ScriptTweakMessageRepository,
  CreateScriptTweakMessageParams,
} from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";

// --- In-Memory Repository (mirrors Prisma implementation behavior) ---

class InMemoryScriptTweakMessageRepository implements ScriptTweakMessageRepository {
  private messages: ScriptTweakMessage[] = [];
  private counter = 0;

  constructor(initialMessages: ScriptTweakMessage[] = []) {
    this.messages = [...initialMessages];
  }

  async findByJobId(jobId: string): Promise<ScriptTweakMessage[]> {
    return this.messages
      .filter((m) => m.jobId === jobId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findRecentByJobId(
    jobId: string,
    limit: number,
  ): Promise<ScriptTweakMessage[]> {
    // Mirror Prisma: order by createdAt desc, take limit, then reverse
    const descSorted = this.messages
      .filter((m) => m.jobId === jobId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const taken = descSorted.slice(0, limit);
    return taken.reverse();
  }

  async create(
    params: CreateScriptTweakMessageParams,
  ): Promise<ScriptTweakMessage> {
    const msg: ScriptTweakMessage = {
      id: `msg-${++this.counter}`,
      createdAt: new Date(),
      jobId: params.jobId,
      role: params.role,
      content: params.content,
    };
    this.messages.push(msg);
    return msg;
  }
}

// --- Arbitraries ---

const roleArb = fc.constantFrom("user", "assistant");

const contentArb = fc.string({ minLength: 1, maxLength: 200 });

/** Generate a ScriptTweakMessage with a specific createdAt timestamp. */
function messageArb(jobId: string): fc.Arbitrary<ScriptTweakMessage> {
  return fc
    .tuple(
      fc.uuid(),
      fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
      roleArb,
      contentArb,
    )
    .map(([id, createdAt, role, content]) => ({
      id,
      createdAt,
      jobId,
      role,
      content,
    }));
}

/** Generate a list of messages with distinct createdAt timestamps for a given jobId. */
function messageListArb(
  jobId: string,
  minLength: number,
  maxLength: number,
): fc.Arbitrary<ScriptTweakMessage[]> {
  return fc
    .array(messageArb(jobId), { minLength, maxLength })
    .chain((messages) => {
      // Ensure distinct createdAt by adding index-based offsets
      return fc.constant(
        messages.map((msg, i) => ({
          ...msg,
          createdAt: new Date(msg.createdAt.getTime() + i),
        })),
      );
    });
}

// --- Helper ---

function isSortedAscending(dates: Date[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (dates[i]!.getTime() < dates[i - 1]!.getTime()) {
      return false;
    }
  }
  return true;
}

// --- Property Tests ---

describe("Feature: script-chat, Property 3: message ordering", () => {
  /**
   * Property 3: For any set of ScriptTweakMessages with varying createdAt,
   * findByJobId returns them sorted by createdAt ascending.
   *
   * **Validates: Requirements 4.4, 5.1, 9.2**
   */
  it("findByJobId returns messages sorted by createdAt ascending", async () => {
    await fc.assert(
      fc.asyncProperty(
        messageListArb("job-ordering-test", 1, 30),
        async (messages) => {
          const repo = new InMemoryScriptTweakMessageRepository(messages);

          const result = await repo.findByJobId("job-ordering-test");

          // All messages should be returned
          expect(result).toHaveLength(messages.length);

          // Messages should be sorted by createdAt ascending
          const timestamps = result.map((m) => m.createdAt);
          expect(isSortedAscending(timestamps)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3 (supplementary): findRecentByJobId also returns messages
   * sorted by createdAt ascending (chronological order).
   *
   * **Validates: Requirements 9.2**
   */
  it("findRecentByJobId returns messages sorted by createdAt ascending", async () => {
    await fc.assert(
      fc.asyncProperty(
        messageListArb("job-recent-ordering", 1, 30),
        fc.integer({ min: 1, max: 30 }),
        async (messages, limit) => {
          const repo = new InMemoryScriptTweakMessageRepository(messages);

          const result = await repo.findRecentByJobId(
            "job-recent-ordering",
            limit,
          );

          // Result should be sorted ascending
          const timestamps = result.map((m) => m.createdAt);
          expect(isSortedAscending(timestamps)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: script-chat, Property 4: context window limit", () => {
  /**
   * Property 4: For any list of N messages, findRecentByJobId(jobId, 10)
   * returns at most 10 messages, all from the most recent end.
   *
   * **Validates: Requirements 6.5, 9.1**
   */
  it("findRecentByJobId(jobId, 10) returns at most 10 messages from the most recent end", async () => {
    await fc.assert(
      fc.asyncProperty(
        messageListArb("job-context-window", 0, 50),
        async (messages) => {
          const repo = new InMemoryScriptTweakMessageRepository(messages);

          const result = await repo.findRecentByJobId("job-context-window", 10);

          // At most 10 messages
          expect(result.length).toBeLessThanOrEqual(10);

          // Should return exactly min(N, 10) messages
          expect(result.length).toBe(Math.min(messages.length, 10));

          if (messages.length > 0 && result.length > 0) {
            // All returned messages should be from the most recent end.
            // Sort all messages by createdAt ascending to find the expected recent ones.
            const allSorted = [...messages].sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );
            const expectedRecent = allSorted.slice(-10);

            // The returned IDs should match the expected most-recent IDs
            const resultIds = new Set(result.map((m) => m.id));
            const expectedIds = new Set(expectedRecent.map((m) => m.id));
            expect(resultIds).toEqual(expectedIds);

            // Result should be in ascending chronological order
            const timestamps = result.map((m) => m.createdAt);
            expect(isSortedAscending(timestamps)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4 (supplementary): For any limit value, findRecentByJobId
   * respects the limit parameter.
   *
   * **Validates: Requirements 6.5, 9.1**
   */
  it("findRecentByJobId respects arbitrary limit parameter", async () => {
    await fc.assert(
      fc.asyncProperty(
        messageListArb("job-limit-test", 0, 50),
        fc.integer({ min: 1, max: 50 }),
        async (messages, limit) => {
          const repo = new InMemoryScriptTweakMessageRepository(messages);

          const result = await repo.findRecentByJobId("job-limit-test", limit);

          // At most `limit` messages
          expect(result.length).toBeLessThanOrEqual(limit);

          // Exactly min(N, limit) messages
          expect(result.length).toBe(Math.min(messages.length, limit));
        },
      ),
      { numRuns: 100 },
    );
  });
});
