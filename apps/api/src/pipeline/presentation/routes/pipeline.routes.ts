import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import { HttpRequest } from "@/shared/presentation/http/http-request.js";
import { HttpResponse } from "@/shared/presentation/http/http-response.js";
import type { PipelineController } from "../controllers/pipeline.controller.js";
import type { StreamController } from "../controllers/stream.controller.js";
import type { ProgressController } from "../controllers/progress.controller.js";

export interface PipelineRateLimiters {
  jobCreation: RequestHandler;
  llmOperation: RequestHandler;
  exportOperation: RequestHandler;
}

export function createPipelineRouter(
  controller: PipelineController,
  streamController: StreamController,
  progressController: ProgressController,
  rateLimiters?: PipelineRateLimiters,
): Router {
  const router = Router();
  const noop: RequestHandler = (_req, _res, next) => next();
  const jobCreation = rateLimiters?.jobCreation ?? noop;
  const llmOp = rateLimiters?.llmOperation ?? noop;
  const exportOp = rateLimiters?.exportOperation ?? noop;

  router.get("/showcase", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.listShowcase(httpReq, httpRes);
  });

  router.post("/jobs", jobCreation, async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.createJob(httpReq, httpRes);
  });

  router.get("/jobs/:id", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.getJobStatus(httpReq, httpRes);
  });

  router.get("/jobs", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.listJobs(httpReq, httpRes);
  });

  router.post(
    "/jobs/:id/approve-script",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.approveScript(httpReq, httpRes);
    },
  );

  router.post(
    "/jobs/:id/regenerate-script",
    llmOp,
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.regenerateScript(httpReq, httpRes);
    },
  );

  router.post(
    "/jobs/:id/regenerate-code",
    llmOp,
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.regenerateCode(httpReq, httpRes);
    },
  );

  router.post("/jobs/:id/autofix-code", llmOp, async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.autofixCode(httpReq, httpRes);
  });

  router.post("/jobs/:id/retry", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.retryJob(httpReq, httpRes);
  });

  router.get("/jobs/:id/stream", async (req: Request, res: Response) => {
    await streamController.streamScriptGeneration(req, res);
  });

  router.get("/jobs/:id/progress", async (req: Request, res: Response) => {
    await progressController.streamProgress(req, res);
  });

  router.get("/themes", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.getThemes(httpReq, httpRes);
  });

  router.get("/voices", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.listVoices(httpReq, httpRes);
  });

  router.get("/jobs/:id/preview", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.getPreviewData(httpReq, httpRes);
  });

  router.post("/jobs/:id/export", exportOp, async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.exportVideo(httpReq, httpRes);
  });

  router.post("/jobs/:id/tweak", llmOp, async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.sendTweak(httpReq, httpRes);
  });

  router.get(
    "/jobs/:id/tweak/messages",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.getTweakMessages(httpReq, httpRes);
    },
  );

  router.post("/jobs/:id/script-tweak", llmOp, async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.sendScriptTweak(httpReq, httpRes);
  });

  router.get(
    "/jobs/:id/script-tweak/messages",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.getScriptTweakMessages(httpReq, httpRes);
    },
  );

  return router;
}
