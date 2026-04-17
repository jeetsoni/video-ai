import type { HttpRequest } from "./http-request.js";
import type { HttpResponse } from "./http-response.js";

export interface Controller {
  handle(httpRequest: HttpRequest, httpResponse: HttpResponse): Promise<void>;
}
