import { jest } from "@jest/globals";
import { SendScriptTweakUseCase } from "./send-script-tweak.use-case.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import { PipelineStage } from "@/pipeline/domain/value-objects/pipeline-stage.js";
import { PipelineStatus } from "@/pipeline/domain/value-objects/pipeline-status.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";
import type { ScriptTweakMessageRepository } from "@/pipeline/domain/interfaces/repositories/script-tweak-message-repository.js";
import type { ScriptTweaker } from "@/pipeline/application/interfaces/script-tweaker.js";
import type { ScriptTweakMessage } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeJob(
  overrides: {
    stage?: string;
    generatedScript?: string | null;
  } = {},
): PipelineJob {
  const stage = overrides.stage ?? "script_review";
  const generatedScript =
    overrides.generatedScript !== undefined
      ? overrides.generatedScript
      : "This is the current script.";

  return PipelineJob.reconstitute({
    id: "job-1",
    browserId: "browser-1",
    topic: "AI basics",
    format: VideoFormat.create("reel").getValue(),
    themeId: AnimationThemeId.create("theme-1").getValue(),
    voiceId: null,
    voiceSettings: null,
    status: PipelineStatus.awaitingScriptReview(),
    stage: PipelineStage.create(stage)!,
    error: null,
    generatedScript,
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

function makeScriptTweakMessage(
  overrides: Partial<ScriptTweakMessage> = {},
): ScriptTweakMessage {
  return {
    id: "msg-1",
    jobId: "job-1",
    role: "user",
    content: "Make it shorter",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMocks() {
  const repository: PipelineJobRepository = {
    findById: jest.fn<AnyFn>(),
    save: jest.fn<AnyFn>().mockResolvedValue(undefined),
    findAll: jest.fn<AnyFn>(),
    count: jest.fn<AnyFn>(),
    findAllCompleted: jest.fn<AnyFn>(),
    countCompleted: jest.fn<AnyFn>(),
  };

  const scriptTweakMessageRepository: ScriptTweakMessageRepository = {
    create: jest.fn<AnyFn>().mockResolvedValue(makeScriptTweakMessage()),
    findByJobId: jest.fn<AnyFn>().mockResolvedValue([]),
    findRecentByJobId: jest.fn<AnyFn>().mockResolvedValue([]),
  };

  const scriptTweaker: ScriptTweaker = {
    tweakScript: jest.fn<AnyFn>(),
  };

  return { repository, scriptTweakMessageRepository, scriptTweaker };
}

describe("SendScriptTweakUseCase", () => {
  it("returns NOT_FOUND when job does not exist", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(null);

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    const result = await useCase.execute({
      jobId: "missing",
      message: "tweak it",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
    expect(result.getError().message).toContain("missing");
  });

  it("returns CONFLICT when job is not in script_review stage", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    const job = makeJob({ stage: "preview" });
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(job);

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    const result = await useCase.execute({
      jobId: "job-1",
      message: "tweak it",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("CONFLICT");
    expect(result.getError().message).toContain("preview");
  });

  it("returns NOT_FOUND when job has no generated script", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    const job = makeJob({ generatedScript: null });
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(job);

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    const result = await useCase.execute({
      jobId: "job-1",
      message: "tweak it",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("NOT_FOUND");
    expect(result.getError().message).toContain("no generated script");
  });

  it("returns updated script and explanation on successful tweak", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    const job = makeJob();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(job);
    (
      scriptTweakMessageRepository.findRecentByJobId as jest.Mock<AnyFn>
    ).mockResolvedValue([
      makeScriptTweakMessage({ role: "user", content: "Make it shorter" }),
    ]);
    (scriptTweaker.tweakScript as jest.Mock<AnyFn>).mockResolvedValue(
      Result.ok({
        tweakedScript: "Shorter script.",
        explanation: "Made it shorter",
      }),
    );

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    const result = await useCase.execute({
      jobId: "job-1",
      message: "Make it shorter",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      updatedScript: "Shorter script.",
      explanation: "Made it shorter",
      updatedScenes: [],
    });
  });

  it("returns TWEAK_FAILED and persists error message when tweaker fails", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    const job = makeJob();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(job);
    (
      scriptTweakMessageRepository.findRecentByJobId as jest.Mock<AnyFn>
    ).mockResolvedValue([]);
    (scriptTweaker.tweakScript as jest.Mock<AnyFn>).mockResolvedValue(
      Result.fail(new PipelineError("AI failed", "script_generation_failed")),
    );

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    const result = await useCase.execute({
      jobId: "job-1",
      message: "tweak it",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("TWEAK_FAILED");
    expect(result.getError().message).toBe("AI failed");

    // Error should be persisted as an assistant message
    expect(scriptTweakMessageRepository.create).toHaveBeenCalledWith({
      jobId: "job-1",
      role: "assistant",
      content: "AI failed",
    });
  });

  it("persists user message before calling tweaker and assistant message after success", async () => {
    const { repository, scriptTweakMessageRepository, scriptTweaker } =
      makeMocks();
    const job = makeJob();
    (repository.findById as jest.Mock<AnyFn>).mockResolvedValue(job);
    (
      scriptTweakMessageRepository.findRecentByJobId as jest.Mock<AnyFn>
    ).mockResolvedValue([]);
    (scriptTweaker.tweakScript as jest.Mock<AnyFn>).mockResolvedValue(
      Result.ok({ tweakedScript: "Updated.", explanation: "Done" }),
    );

    const useCase = new SendScriptTweakUseCase(
      repository,
      scriptTweakMessageRepository,
      scriptTweaker,
    );

    await useCase.execute({ jobId: "job-1", message: "Fix intro" });

    const createCalls = (
      scriptTweakMessageRepository.create as jest.Mock<AnyFn>
    ).mock.calls;
    expect(createCalls).toHaveLength(2);

    // First call: user message
    expect(createCalls[0]![0]).toEqual({
      jobId: "job-1",
      role: "user",
      content: "Fix intro",
    });

    // Second call: assistant message
    expect(createCalls[1]![0]).toEqual({
      jobId: "job-1",
      role: "assistant",
      content: "Done",
    });

    // Job should be saved
    expect(repository.save).toHaveBeenCalledWith(job);
  });
});
