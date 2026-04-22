import { jest } from "@jest/globals";
import { ListPipelineJobsUseCase } from "./list-pipeline-jobs.use-case.js";
import { PipelineJob } from "@/pipeline/domain/entities/pipeline-job.js";
import { VideoFormat } from "@/pipeline/domain/value-objects/video-format.js";
import { AnimationThemeId } from "@/pipeline/domain/value-objects/animation-theme.js";
import type { PipelineJobRepository } from "@/pipeline/domain/interfaces/repositories/pipeline-job-repository.js";

function makeJob(id: string = "job-1"): PipelineJob {
  return PipelineJob.create({
    id,
    browserId: "browser-1",
    topic: "How databases work",
    format: VideoFormat.create("short").getValue(),
    themeId: AnimationThemeId.create("studio").getValue(),
  });
}

function createMockRepository(): jest.Mocked<PipelineJobRepository> {
  return {
    save: jest.fn<PipelineJobRepository["save"]>().mockResolvedValue(undefined),
    findById: jest.fn<PipelineJobRepository["findById"]>().mockResolvedValue(null),
    findAll: jest.fn<PipelineJobRepository["findAll"]>().mockResolvedValue([]),
    count: jest.fn<PipelineJobRepository["count"]>().mockResolvedValue(0),
    findAllCompleted: jest.fn<PipelineJobRepository["findAllCompleted"]>().mockResolvedValue([]),
    countCompleted: jest.fn<PipelineJobRepository["countCompleted"]>().mockResolvedValue(0),
  };
}

describe("ListPipelineJobsUseCase", () => {
  let repository: jest.Mocked<PipelineJobRepository>;
  let useCase: ListPipelineJobsUseCase;

  beforeEach(() => {
    repository = createMockRepository();
    useCase = new ListPipelineJobsUseCase(repository);
  });

  it("returns jobs, total, page, and limit on happy path", async () => {
    const jobs = [makeJob("job-1"), makeJob("job-2")];
    repository.findAll.mockResolvedValue(jobs);
    repository.count.mockResolvedValue(10);

    const result = await useCase.execute({ page: 1, limit: 5 });

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.jobs).toHaveLength(2);
    expect(value.total).toBe(10);
    expect(value.page).toBe(1);
    expect(value.limit).toBe(5);
  });

  it("returns INVALID_INPUT when page < 1", async () => {
    const result = await useCase.execute({ page: 0, limit: 10 });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_INPUT");
  });

  it("returns INVALID_INPUT when limit < 1", async () => {
    const result = await useCase.execute({ page: 1, limit: 0 });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_INPUT");
  });

  it("passes browserId to repository.findAll and repository.count", async () => {
    const result = await useCase.execute({ page: 1, limit: 10, browserId: "browser-abc" });

    expect(result.isSuccess).toBe(true);
    expect(repository.findAll).toHaveBeenCalledWith(1, 10, "browser-abc");
    expect(repository.count).toHaveBeenCalledWith("browser-abc");
  });
});
