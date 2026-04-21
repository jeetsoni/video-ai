import { Router } from "express";
import type { Request, Response } from "express";
import { HttpRequest } from "@/shared/presentation/http/http-request.js";
import { HttpResponse } from "@/shared/presentation/http/http-response.js";
import type { PipelineController } from "../controllers/pipeline.controller.js";
import type { StreamController } from "../controllers/stream.controller.js";
import type { ProgressController } from "../controllers/progress.controller.js";

export function createPipelineRouter(
  controller: PipelineController,
  streamController: StreamController,
  progressController: ProgressController,
): Router {
  const router = Router();

  router.get("/showcase", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.listShowcase(httpReq, httpRes);
  });

  router.post("/jobs", async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.regenerateScript(httpReq, httpRes);
    },
  );

  router.post(
    "/jobs/:id/regenerate-code",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.regenerateCode(httpReq, httpRes);
    },
  );

  router.post(
    "/jobs/:id/autofix-code",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.autofixCode(httpReq, httpRes);
    },
  );

  router.post(
    "/jobs/:id/retry",
    async (req: Request, res: Response) => {
      const httpReq = HttpRequest.fromExpress(req);
      const httpRes = HttpResponse.fromExpress(res);
      await controller.retryJob(httpReq, httpRes);
    },
  );

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

  router.post("/jobs/:id/export", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.exportVideo(httpReq, httpRes);
  });

  router.post("/jobs/:id/tweak", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.sendTweak(httpReq, httpRes);
  });

  router.get("/jobs/:id/tweak/messages", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.getTweakMessages(httpReq, httpRes);
  });

  return router;
}
