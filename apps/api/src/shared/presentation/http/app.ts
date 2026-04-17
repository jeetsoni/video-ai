import express from "express";
import { healthRouter } from "./routes/health.route.js";

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());

  app.use("/health", healthRouter);

  return app;
}
