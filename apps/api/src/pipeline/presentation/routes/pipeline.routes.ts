import { Router } from "express";
import type { Request, Response } from "express";
import { HttpRequest } from "@/shared/presentation/http/http-request.js";
import { HttpResponse } from "@/shared/presentation/http/http-response.js";
import type { PipelineController } from "../controllers/pipeline.controller.js";

export function createPipelineRouter(controller: PipelineController): Router {
  const router = Router();

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

  router.post("/jobs/:id/approve-script", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.approveScript(httpReq, httpRes);
  });

  router.post("/jobs/:id/regenerate-script", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.regenerateScript(httpReq, httpRes);
  });

  router.post("/jobs/:id/approve-scene-plan", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.approveScenePlan(httpReq, httpRes);
  });

  router.post("/jobs/:id/regenerate-scene-plan", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.regenerateScenePlan(httpReq, httpRes);
  });

  router.get("/themes", async (req: Request, res: Response) => {
    const httpReq = HttpRequest.fromExpress(req);
    const httpRes = HttpResponse.fromExpress(res);
    await controller.getThemes(httpReq, httpRes);
  });

  return router;
}
