import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";

/**
 * Middleware that reads the X-Browser-Id header and ensures a corresponding
 * BrowserUser record exists (upsert on first request from a new browser).
 *
 * This is a lightweight alternative to full authentication — each browser
 * gets a UUID stored in localStorage, and the backend auto-creates a user
 * record for it.
 */
export function createBrowserIdMiddleware(prisma: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const browserId = req.headers["x-browser-id"] as string | undefined;

    if (browserId) {
      try {
        await prisma.browserUser.upsert({
          where: { id: browserId },
          create: { id: browserId },
          update: {},
        });
      } catch {
        // Non-blocking — if the upsert fails, the request continues.
        // Individual endpoints that require browserId will validate it.
      }
    }

    next();
  };
}
