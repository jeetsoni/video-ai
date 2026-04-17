import { createPipelineJobSchema, approveScriptSchema } from "@video-ai/shared";
import type { HttpRequest } from "@/shared/presentation/http/http-request.js";
import type { HttpResponse } from "@/shared/presentation/http/http-response.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { CreatePipelineJobUseCase } from "@/pipeline/application/use-cases/create-pipeline-job.use-case.js";
import type { GetJobStatusUseCase } from "@/pipeline/application/use-cases/get-job-status.use-case.js";
import type { ListPipelineJobsUseCase } from "@/pipeline/application/use-cases/list-pipeline-jobs.use-case.js";
import type { ApproveScriptUseCase } from "@/pipeline/application/use-cases/approve-script.use-case.js";
import type { RegenerateScriptUseCase } from "@/pipeline/application/use-cases/regenerate-script.use-case.js";
import type { ApproveScenePlanUseCase } from "@/pipeline/application/use-cases/approve-scene-plan.use-case.js";
import type { RegenerateScenePlanUseCase } from "@/pipeline/application/use-cases/regenerate-scene-plan.use-case.js";

type ThemeDto = {
  id: string;
  name: string;
  description: string;
  palette: unknown;
  isDefault: boolean;
  sortOrder: number;
};

export class PipelineController {
  constructor(
    private readonly createPipelineJobUseCase: CreatePipelineJobUseCase,
    private readonly getJobStatusUseCase: GetJobStatusUseCase,
    private readonly listPipelineJobsUseCase: ListPipelineJobsUseCase,
    private readonly approveScriptUseCase: ApproveScriptUseCase,
    private readonly regenerateScriptUseCase: RegenerateScriptUseCase,
    private readonly approveScenePlanUseCase: ApproveScenePlanUseCase,
    private readonly regenerateScenePlanUseCase: RegenerateScenePlanUseCase,
    private readonly getThemesFn: () => Promise<ThemeDto[]>,
  ) {}

  async createJob(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const parsed = createPipelineJobSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid input";
        res.badRequest({ error: "INVALID_INPUT", message });
        return;
      }

      const result = await this.createPipelineJobUseCase.execute(parsed.data);
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      const { id, status } = result.getValue();
      res.created({ jobId: id, status });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async getJobStatus(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.getJobStatusUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok(result.getValue());
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async listJobs(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const result = await this.listPipelineJobsUseCase.execute({ page, limit });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok(result.getValue());
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async approveScript(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const parsed = approveScriptSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid input";
        res.badRequest({ error: "INVALID_INPUT", message });
        return;
      }

      const result = await this.approveScriptUseCase.execute({
        jobId: id,
        editedScript: parsed.data.script,
      });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async regenerateScript(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.regenerateScriptUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async approveScenePlan(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.approveScenePlanUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async regenerateScenePlan(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.regenerateScenePlanUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  async getThemes(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const themes = await this.getThemesFn();
      res.ok({ themes });
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  private handleValidationError(res: HttpResponse, error: ValidationError): void {
    const payload = { error: error.code, message: error.message };

    switch (error.code) {
      case "NOT_FOUND":
        res.notFound(payload);
        break;
      case "CONFLICT":
        res.conflict(payload);
        break;
      default:
        res.badRequest(payload);
        break;
    }
  }
}
