import type { AppEnv } from "../types/env-types.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { timeout } from "hono/timeout";

import { checkHealth } from "../handlers/health-handler.js";
import { handleGetJob } from "../handlers/job-handler.js";
import {
  handleBatchScrape,
  handleDomainMap,
  handleDomainScrape,
  handlePdfScrape,
  handleSingleScrape,
} from "../handlers/scrape-handler.js";

import { serviceAuth } from "../middlewares/service-auth.js";

const scrapeRouter = new Hono<AppEnv>();

//  Health (public — no auth)
scrapeRouter.get("/health", checkHealth);

//  Single URL scrape
scrapeRouter.post(
  "/url",
  serviceAuth,
  timeout(25_000, () => new HTTPException(408, { message: "Scrape request timed out" })),
  handleSingleScrape,
);

//  Batch scrape
scrapeRouter.post(
  "/batch",
  serviceAuth,
  timeout(25_000, () => new HTTPException(408, { message: "Batch scrape request timed out" })),
  handleBatchScrape,
);

//  Domain URL discovery
scrapeRouter.post(
  "/domain/map",
  serviceAuth,
  timeout(20_000, () => new HTTPException(408, { message: "Domain map request timed out" })),
  handleDomainMap,
);

//  Full domain scrape (always async + webhook)
scrapeRouter.post(
  "/domain/scrape",
  serviceAuth,
  timeout(10_000, () => new HTTPException(408, { message: "Request timed out" })),
  handleDomainScrape,
);

//  PDF scrape
scrapeRouter.post(
  "/pdf",
  serviceAuth,
  timeout(60_000, () => new HTTPException(408, { message: "PDF scrape request timed out" })),
  handlePdfScrape,
);

//  Job stats
scrapeRouter.get(
  "/jobs/:jobId",
  serviceAuth,
  handleGetJob,
);

export default scrapeRouter;
