import type { Request, Response, NextFunction } from "express";
import type { Controller } from "./controller.js";
import { HttpRequest } from "./http-request.js";
import { HttpResponse } from "./http-response.js";

export class ControllerFactory {
  static create(
    controller: Controller
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const httpRequest = HttpRequest.fromExpress(req);
        const httpResponse = HttpResponse.fromExpress(res);
        await controller.handle(httpRequest, httpResponse);
      } catch (error) {
        next(error);
      }
    };
  }
}
