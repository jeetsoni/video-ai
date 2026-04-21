import { jest } from "@jest/globals";
import { GetScriptTweakMessagesUseCase } from "./get-script-tweak-messages.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ScriptTweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";
import type { ScriptTweakMessage } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeJob(): PipelineJob {
  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "AI basics",
    format: VideoFormat.create("reel").getValue(),
    themeId: AnimationThemeId.create("theme-1").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.awaitingScriptReview(),
    stage: PipelineStage.create("script_review")!,
    error: null,
    generatedScript: "Some script",
    approvedScript: null,
    generatedScenes: [],
    approvedScenes: null,
    audioPath: null,
    transcript: null,
    scenePlan: null,
    sceneDirections: null,
    generatedCode: null,
    codePath: null,
    videoPath: null,
    thumbnailPath: null,
    lastRenderedCodeHash: null,
    progressPercent: 15,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
}

function makeMocks() {
  const repository: PipelineJobRepository = {
    findById: jest.fn<AnyFn>(),
    save: jest.fn<AnyFn>(),
    findAll: jest.fn<AnyFn>(),
    count: jest.fn<AnyFn>(),
    findAllCompleted: jest.fn<AnyFn>(),
    countCompleted: jest.fn<AnyFn>(),
  };

  const scriptTweakMessageRepository: ScriptTweakMessageRepository = {
    create: jest.fn<AnyFn>(),
    findByJobId: jest.fn<AnyFn>().mockResolvedValue([]),
    findRecentByJobId: jest.fn<AnyFn>(),
  };

  return { repository, scriptTweakMessageRepository };
}

describe("GetScriptTweakMessagesUseCase", () => {
  it("returns NOT_FOUND when job does not exist", async () => {
    const { repository, scriptTweakMessageRepository } = makeMocks();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(null);

    const useCase = new GetScriptTweakMessagesUseCase(
      repository,
      scriptTweakMessageRepository,
    );

    const result = await useCase.execute({ jobId: "missing" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
    expect(result.getError().message).toContain("missing");
  });

  it("returns mapped messages for a valid job", async () => {
    const { repository, scriptTweakMessageRepository } = makeMocks();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(makeJob());

    const rawMessages: ScriptTweakMessage[] = [
      {
        id: "msg-1",
        jobId: "job-1",
        role: "user",
        content: "Make it shorter",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "msg-2",
        jobId: "job-1",
        role: "assistant",
        content: "Done, made it shorter",
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
    ];
    (
      scriptTweakMessageRepository.findByJobId as jest.Mock<AnyFn>
    ).mockResolvedValue(rawMessages);

    const useCase = new GetScriptTweakMessagesUseCase(
      repository,
      scriptTweakMessageRepository,
    );

    const result = await useCase.execute({ jobId: "job-1" });

    expect(result.isSuccess).toBe(true);
    const { messages } = result.getValue();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      id: "msg-1",
      jobId: "job-1",
      role: "user",
      content: "Make it shorter",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(messages[1]).toEqual({
      id: "msg-2",
      jobId: "job-1",
      role: "assistant",
      content: "Done, made it shorter",
      createdAt: "2024-01-01T00:01:00.000Z",
    });
  });
});
