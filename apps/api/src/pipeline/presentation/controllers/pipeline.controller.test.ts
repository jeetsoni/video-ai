import { jest } from "@jest/globals";
import { PipelineController } from "./pipeline.controller.js";
import { HttpRequest } from "@/shared/presentation/http/http-request.js";
import type { HttpResponse } from "@/shared/presentation/http/http-response.js";
import { Result } from "@/shared/domain/result.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockRes(): HttpResponse {
  return {
    ok: jest.fn<AnyFn>(),
    created: jest.fn<AnyFn>(),
    badRequest: jest.fn<AnyFn>(),
    notFound: jest.fn<AnyFn>(),
    conflict: jest.fn<AnyFn>(),
    serverError: jest.fn<AnyFn>(),
  } as unknown as HttpResponse;
}

function makeReq(overrides: {
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): HttpRequest {
  return new HttpRequest(
    overrides.body ?? {},
    overrides.query ?? {},
    overrides.params ?? {},
    overrides.headers ?? {},
  );
}

function buildController(
  overrides: Partial<Record<string, unknown>> = {},
): PipelineController {
  const defaults = {
    createPipelineJobUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    getJobStatusUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    listPipelineJobsUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    approveScriptUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    regenerateScriptUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    regenerateCodeUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    autofixCodeUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    retryJobUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    getThemesFn: jest.fn<(...args: any[]) => any>(),
    getPreviewDataUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    exportVideoUseCase: { execute: jest.fn<(...args: any[]) => any>() },
    listVoicesUseCase: { execute: jest.fn<(...args: any[]) => any>() },
  };
  const merged = { ...defaults, ...overrides };
  return new PipelineController(
    merged.createPipelineJobUseCase as any,
    merged.getJobStatusUseCase as any,
    merged.listPipelineJobsUseCase as any,
    merged.approveScriptUseCase as any,
    merged.regenerateScriptUseCase as any,
    merged.regenerateCodeUseCase as any,
    merged.autofixCodeUseCase as any,
    merged.retryJobUseCase as any,
    merged.getThemesFn as any,
    merged.getPreviewDataUseCase as any,
    merged.exportVideoUseCase as any,
    merged.listVoicesUseCase as any,
  );
}

describe("PipelineController", () => {
  describe("createJob", () => {
    it("returns 201 with jobId and status on success", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(Result.ok({ id: "job-1", status: "pending" }));
      const ctrl = buildController({ createPipelineJobUseCase: { execute } });
      const req = makeReq({
        body: { topic: "AI basics", format: "reel", themeId: "t1" },
        headers: { "x-browser-id": "browser-1" },
      });
      const res = mockRes();

      await ctrl.createJob(req, res);

      expect(res.created).toHaveBeenCalledWith({
        jobId: "job-1",
        status: "pending",
      });
    });

    it("returns 400 when X-Browser-Id header is missing", async () => {
      const ctrl = buildController();
      const req = makeReq({
        body: { topic: "AI basics", format: "reel", themeId: "t1" },
      });
      const res = mockRes();

      await ctrl.createJob(req, res);

      expect(res.badRequest).toHaveBeenCalledWith({
        error: "MISSING_BROWSER_ID",
        message: "X-Browser-Id header is required",
      });
    });

    it("returns 400 when body fails Zod validation", async () => {
      const ctrl = buildController();
      const req = makeReq({
        body: { topic: "ab" },
        headers: { "x-browser-id": "browser-1" },
      }); // too short, missing fields
      const res = mockRes();

      await ctrl.createJob(req, res);

      expect(res.badRequest).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_INPUT" }),
      );
    });

    it("returns 400 when use case fails with validation error", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(
          Result.fail(new ValidationError("Bad format", "INVALID_INPUT")),
        );
      const ctrl = buildController({ createPipelineJobUseCase: { execute } });
      const req = makeReq({
        body: { topic: "AI basics", format: "reel", themeId: "t1" },
        headers: { "x-browser-id": "browser-1" },
      });
      const res = mockRes();

      await ctrl.createJob(req, res);

      expect(res.badRequest).toHaveBeenCalledWith({
        error: "INVALID_INPUT",
        message: "Bad format",
      });
    });

    it("returns 500 on unexpected error", async () => {
      const execute = jest.fn<AnyFn>().mockRejectedValue(new Error("boom"));
      const ctrl = buildController({ createPipelineJobUseCase: { execute } });
      const req = makeReq({
        body: { topic: "AI basics", format: "reel", themeId: "t1" },
        headers: { "x-browser-id": "browser-1" },
      });
      const res = mockRes();

      await ctrl.createJob(req, res);

      expect(res.serverError).toHaveBeenCalledWith({
        error: "internal_error",
        message: "Internal server error",
      });
    });
  });

  describe("getJobStatus", () => {
    it("returns 200 with job DTO on success", async () => {
      const jobDto = { id: "job-1", status: "pending" };
      const execute = jest.fn<AnyFn>().mockResolvedValue(Result.ok(jobDto));
      const ctrl = buildController({ getJobStatusUseCase: { execute } });
      const req = makeReq({ params: { id: "job-1" } });
      const res = mockRes();

      await ctrl.getJobStatus(req, res);

      expect(execute).toHaveBeenCalledWith({ jobId: "job-1" });
      expect(res.ok).toHaveBeenCalledWith(jobDto);
    });

    it("returns 404 when job not found", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(
          Result.fail(new ValidationError("Not found", "NOT_FOUND")),
        );
      const ctrl = buildController({ getJobStatusUseCase: { execute } });
      const req = makeReq({ params: { id: "missing" } });
      const res = mockRes();

      await ctrl.getJobStatus(req, res);

      expect(res.notFound).toHaveBeenCalledWith({
        error: "NOT_FOUND",
        message: "Not found",
      });
    });
  });

  describe("listJobs", () => {
    it("returns 200 with paginated jobs using defaults", async () => {
      const data = { jobs: [], total: 0, page: 1, limit: 20 };
      const execute = jest.fn<AnyFn>().mockResolvedValue(Result.ok(data));
      const ctrl = buildController({ listPipelineJobsUseCase: { execute } });
      const req = makeReq({ query: {} });
      const res = mockRes();

      await ctrl.listJobs(req, res);

      expect(execute).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(res.ok).toHaveBeenCalledWith(data);
    });

    it("parses page and limit from query", async () => {
      const data = { jobs: [], total: 0, page: 2, limit: 10 };
      const execute = jest.fn<AnyFn>().mockResolvedValue(Result.ok(data));
      const ctrl = buildController({ listPipelineJobsUseCase: { execute } });
      const req = makeReq({ query: { page: "2", limit: "10" } });
      const res = mockRes();

      await ctrl.listJobs(req, res);

      expect(execute).toHaveBeenCalledWith({ page: 2, limit: 10 });
    });
  });

  describe("approveScript", () => {
    it("returns 200 on success", async () => {
      const execute = jest.fn<AnyFn>().mockResolvedValue(Result.ok(undefined));
      const ctrl = buildController({ approveScriptUseCase: { execute } });
      const req = makeReq({
        params: { id: "job-1" },
        body: { action: "approve", script: "edited script text here" },
      });
      const res = mockRes();

      await ctrl.approveScript(req, res);

      expect(execute).toHaveBeenCalledWith({
        jobId: "job-1",
        editedScript: "edited script text here",
        scenes: undefined,
        voiceId: undefined,
        voiceSettings: undefined,
      });
      expect(res.ok).toHaveBeenCalledWith({ status: "ok" });
    });

    it("returns 400 on invalid body", async () => {
      const ctrl = buildController();
      const req = makeReq({
        params: { id: "job-1" },
        body: { action: "reject" },
      });
      const res = mockRes();

      await ctrl.approveScript(req, res);

      expect(res.badRequest).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_INPUT" }),
      );
    });

    it("returns 409 on CONFLICT error", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(
          Result.fail(new ValidationError("Wrong status", "CONFLICT")),
        );
      const ctrl = buildController({ approveScriptUseCase: { execute } });
      const req = makeReq({
        params: { id: "job-1" },
        body: { action: "approve" },
      });
      const res = mockRes();

      await ctrl.approveScript(req, res);

      expect(res.conflict).toHaveBeenCalledWith({
        error: "CONFLICT",
        message: "Wrong status",
      });
    });

    it("returns 404 on NOT_FOUND error", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(
          Result.fail(new ValidationError("Not found", "NOT_FOUND")),
        );
      const ctrl = buildController({ approveScriptUseCase: { execute } });
      const req = makeReq({
        params: { id: "job-1" },
        body: { action: "approve" },
      });
      const res = mockRes();

      await ctrl.approveScript(req, res);

      expect(res.notFound).toHaveBeenCalledWith({
        error: "NOT_FOUND",
        message: "Not found",
      });
    });
  });

  describe("regenerateScript", () => {
    it("returns 200 on success", async () => {
      const execute = jest.fn<AnyFn>().mockResolvedValue(Result.ok(undefined));
      const ctrl = buildController({ regenerateScriptUseCase: { execute } });
      const req = makeReq({ params: { id: "job-1" } });
      const res = mockRes();

      await ctrl.regenerateScript(req, res);

      expect(execute).toHaveBeenCalledWith({ jobId: "job-1" });
      expect(res.ok).toHaveBeenCalledWith({ status: "ok" });
    });

    it("returns 409 on CONFLICT", async () => {
      const execute = jest
        .fn<AnyFn>()
        .mockResolvedValue(
          Result.fail(new ValidationError("Wrong status", "CONFLICT")),
        );
      const ctrl = buildController({ regenerateScriptUseCase: { execute } });
      const req = makeReq({ params: { id: "job-1" } });
      const res = mockRes();

      await ctrl.regenerateScript(req, res);

      expect(res.conflict).toHaveBeenCalledWith({
        error: "CONFLICT",
        message: "Wrong status",
      });
    });
  });

  describe("getThemes", () => {
    it("returns 200 with themes array", async () => {
      const themes = [
        {
          id: "t1",
          name: "Studio",
          description: "Clean",
          palette: {},
          isDefault: true,
          sortOrder: 0,
        },
      ];
      const getThemesFn = jest.fn<AnyFn>().mockResolvedValue(themes);
      const ctrl = buildController({ getThemesFn });
      const req = makeReq({});
      const res = mockRes();

      await ctrl.getThemes(req, res);

      expect(res.ok).toHaveBeenCalledWith({ themes });
    });

    it("returns 500 on unexpected error", async () => {
      const getThemesFn = jest
        .fn<AnyFn>()
        .mockRejectedValue(new Error("db down"));
      const ctrl = buildController({ getThemesFn });
      const req = makeReq({});
      const res = mockRes();

      await ctrl.getThemes(req, res);

      expect(res.serverError).toHaveBeenCalledWith({
        error: "internal_error",
        message: "Internal server error",
      });
    });
  });
});
