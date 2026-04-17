import type { Request, Response } from "express";
import type { Controller } from "./controller.js";
import { HttpRequest } from "./http-request.js";
import { HttpResponse } from "./http-response.js";

export class ControllerFactory {
  static create(
    controller: Controller
  ): (req: Request, res: Response) => Promise<void> {
    return async (req: Request, res: Response): Promise<void> => {
      const httpRequest = HttpRequest.fromExpress(req);
      const httpResponse = HttpResponse.fromExpress(res);
      await controller.handle(httpRequest, httpResponse);
    };
  }
}
