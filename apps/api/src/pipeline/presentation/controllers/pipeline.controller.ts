import { createPipelineJobSchema, approveScriptSchema } from "@video-ai/shared";
import type { HttpRequest } from "@/shared/presentation/http/http-request.js";
import type { HttpResponse } from "@/shared/presentation/http/http-response.js";
import { ValidationError } from "@/shared/domain/errors/validation.error.js";
import type { CreatePipelineJobUseCase } from "@/pipeline/application/use-cases/create-pipeline-job.use-case.js";
import type { GetJobStatusUseCase } from "@/pipeline/application/use-cases/get-job-status.use-case.js";
import type { ListPipelineJobsUseCase } from "@/pipeline/application/use-cases/list-pipeline-jobs.use-case.js";
import type { ApproveScriptUseCase } from "@/pipeline/application/use-cases/approve-script.use-case.js";
import type { RegenerateScriptUseCase } from "@/pipeline/application/use-cases/regenerate-script.use-case.js";
import type { RegenerateCodeUseCase } from "@/pipeline/application/use-cases/regenerate-code.use-case.js";
import type { AutofixCodeUseCase } from "@/pipeline/application/use-cases/autofix-code.use-case.js";
import type { RetryJobUseCase } from "@/pipeline/application/use-cases/retry-job.use-case.js";
import type { GetPreviewDataUseCase } from "@/pipeline/application/use-cases/get-preview-data.use-case.js";
import type { ExportVideoUseCase } from "@/pipeline/application/use-cases/export-video.use-case.js";
import type { ListVoicesUseCase } from "@/pipeline/application/use-cases/list-voices.use-case.js";
import type { SendTweakUseCase } from "@/pipeline/application/use-cases/send-tweak.use-case.js";
import type { GetTweakMessagesUseCase } from "@/pipeline/application/use-cases/get-tweak-messages.use-case.js";
import type { ListShowcaseUseCase } from "@/pipeline/application/use-cases/list-showcase.use-case.js";

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
    private readonly regenerateCodeUseCase: RegenerateCodeUseCase,
    private readonly autofixCodeUseCase: AutofixCodeUseCase,
    private readonly retryJobUseCase: RetryJobUseCase,
    private readonly getThemesFn: () => Promise<ThemeDto[]>,
    private readonly getPreviewDataUseCase: GetPreviewDataUseCase,
    private readonly exportVideoUseCase: ExportVideoUseCase,
    private readonly listVoicesUseCase: ListVoicesUseCase,
    private readonly sendTweakUseCase: SendTweakUseCase,
    private readonly getTweakMessagesUseCase: GetTweakMessagesUseCase,
    private readonly listShowcaseUseCase: ListShowcaseUseCase,
  ) {}

  async createJob(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const browserId = req.headers["x-browser-id"] as string | undefined;
      if (!browserId) {
        res.badRequest({ error: "MISSING_BROWSER_ID", message: "X-Browser-Id header is required" });
        return;
      }

      const parsed = createPipelineJobSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid input";
        res.badRequest({ error: "INVALID_INPUT", message });
        return;
      }

      const result = await this.createPipelineJobUseCase.execute({
        ...parsed.data,
        browserId,
      });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      const { id, status } = result.getValue();
      res.created({ jobId: id, status });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
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
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async listJobs(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const browserId = req.headers["x-browser-id"] as string | undefined;

      const result = await this.listPipelineJobsUseCase.execute({
        page,
        limit,
        browserId,
      });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok(result.getValue());
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
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

      const scenes = parsed.data.scenes?.map((s) => ({
        ...s,
        startTime: 0,
        endTime: 0,
      }));

      const result = await this.approveScriptUseCase.execute({
        jobId: id,
        editedScript: parsed.data.script,
        scenes,
        voiceId: parsed.data.voiceId,
        voiceSettings: parsed.data.voiceSettings,
      });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
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
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async regenerateCode(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.regenerateCodeUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async autofixCode(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const body = req.body as {
        errorMessage?: string;
        errorType?: string;
        sceneIndex?: number;
      };

      if (!body.errorMessage || !body.errorType) {
        res.badRequest({
          error: "INVALID_INPUT",
          message: "errorMessage and errorType are required",
        });
        return;
      }

      const result = await this.autofixCodeUseCase.execute({
        jobId: id,
        errorMessage: body.errorMessage,
        errorType: body.errorType,
        sceneIndex: body.sceneIndex,
      });

      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      const { fixedCode, explanation } = result.getValue();
      res.ok({ status: "ok", fixedCode, explanation });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async retryJob(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.retryJobUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async getThemes(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const themes = await this.getThemesFn();
      res.ok({ themes });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async getPreviewData(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const host = req.headers.host as string | undefined;
      const protocol = (req.headers["x-forwarded-proto"] as string) || "http";
      const apiBaseUrl = host ? `${protocol}://${host}` : undefined;
      const result = await this.getPreviewDataUseCase.execute({
        jobId: id,
        apiBaseUrl,
      });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok(result.getValue());
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async exportVideo(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.exportVideoUseCase.execute({ jobId: id });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok({ status: "ok" });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async listVoices(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const result = await this.listVoicesUseCase.execute();
      if (result.isFailure) {
        res.serverError({
          error: "voice_fetch_failed",
          message: result.getError().message,
        });
        return;
      }
      res.ok(result.getValue());
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async sendTweak(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const body = req.body as {
        message?: string;
        screenshot?: string;
        frame?: number;
        timeSeconds?: number;
      };

      if (!body.message) {
        res.badRequest({
          error: "INVALID_INPUT",
          message: "message is required",
        });
        return;
      }

      const result = await this.sendTweakUseCase.execute({
        jobId: id,
        message: body.message,
        screenshot: body.screenshot,
        frame: body.frame,
        timeSeconds: body.timeSeconds,
      });

      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      const { updatedCode, explanation } = result.getValue();
      res.ok({ status: "ok", updatedCode, explanation });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async getTweakMessages(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.getTweakMessagesUseCase.execute({ jobId: id });

      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      const { messages } = result.getValue();
      res.ok({ messages });
    } catch {
      res.serverError({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  }

  async listShowcase(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 12;
      const host = req.headers.host as string | undefined;
      const protocol = (req.headers["x-forwarded-proto"] as string) || "http";
      const apiBaseUrl = host ? `${protocol}://${host}` : undefined;

      const result = await this.listShowcaseUseCase.execute({ page, limit, apiBaseUrl });
      if (result.isFailure) {
        this.handleValidationError(res, result.getError());
        return;
      }

      res.ok(result.getValue());
    } catch {
      res.serverError({ error: "internal_error", message: "Internal server error" });
    }
  }

  private handleValidationError(
    res: HttpResponse,
    error: ValidationError,
  ): void {
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
