import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import type { VoicePreviewController } from "@/pipeline/presentation/controllers/voice-preview.controller.js";

export function createVoicePreviewRouter(
  controller: VoicePreviewController,
  rateLimitMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/voice-preview",
    rateLimitMiddleware,
    async (req: Request, res: Response) => {
      await controller.handlePreview(req, res);
    },
  );

  return router;
}
