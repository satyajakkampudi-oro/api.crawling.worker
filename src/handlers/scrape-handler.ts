import type { Context } from "hono";
import type { AppEnv } from "../types/env-types.js";

import {
  MSG_DOMAIN_MAPPED,
  MSG_PDF_SCRAPED,
  MSG_SCRAPE_COMPLETE,
  MSG_SCRAPE_QUEUED,
} from "../constants/scrape-messages.js";

import { determineBatchMode, enqueueBatchJob, runSyncBatchScrape } from "../services/batch-scrape-service.js";
import { enqueueDomainJob, mapDomainUrls } from "../services/domain-map-service.js";
import { scrapePdfUrl } from "../services/pdf-scrape-service.js";
import { resolveConcurrency, resolveSingleProvider, scrapeSingleUrl } from "../services/single-scrape-service.js";

import { sendResponse } from "../utils/send-response.js";

import { batchScrapeSchema } from "../validations/schema/v-batch-scrape-schema.js";
import { domainMapSchema, domainScrapeSchema } from "../validations/schema/v-domain-map-schema.js";
import { pdfScrapeSchema } from "../validations/schema/v-pdf-scrape-schema.js";
import { singleScrapeSchema } from "../validations/schema/v-single-scrape-schema.js";
import { validateRequest } from "../validations/validate-request.js";

//  Single URL scrape

export async function handleSingleScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest(await c.req.json(), singleScrapeSchema);
  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);

  const result = await scrapeSingleUrl(
    { url: body.url, provider, waitMs: body.waitMs ?? 3000, useBrowser: body.useBrowser, maxRetries: body.maxRetries ?? 2, metadata: body.metadata },
    c.env,
  );

  return sendResponse(c, 200, MSG_SCRAPE_COMPLETE, result);
}

//  Batch scrape

export async function handleBatchScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest(await c.req.json(), batchScrapeSchema);
  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);
  const concurrency = resolveConcurrency(body.concurrency, c.env.SCRAPINGANT_CONCURRENCY);
  const mode = determineBatchMode(body.urls.length, body.webhookUrl, c.env.SYNC_BATCH_THRESHOLD);
  const jobId = crypto.randomUUID();
  const triggeredAt = new Date().toISOString();
  const jobOptions = {
    jobId,
    triggeredAt,
    urls: body.urls,
    provider,
    concurrency,
    waitMs: body.waitMs,
    useBrowser: body.useBrowser,
    // Sync path: no retries — fail fast to stay within 30s wall-clock limit.
    // Retries only make sense on the async queue worker which has no time limit.
    maxRetries: mode === "sync" ? 0 : (body.maxRetries ?? 2),
    webhookUrl: body.webhookUrl,
    metadata: body.metadata,
  };

  if (mode === "async") {
    const data = await enqueueBatchJob(c.env, jobOptions);
    return sendResponse(c, 202, MSG_SCRAPE_QUEUED, data);
  }

  const data = await runSyncBatchScrape(c.executionCtx, c.env, jobOptions);
  return sendResponse(c, 200, MSG_SCRAPE_COMPLETE, data);
}

//  Domain URL map

export async function handleDomainMap(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest(await c.req.json(), domainMapSchema);

  const result = await mapDomainUrls(
    { domain: body.domain, maxUrls: body.maxUrls, includeSubdomains: body.includeSubdomains, apiKey: c.env.FIRECRAWL_API_KEY, timeoutMs: 20_000 },
    c.env,
  );

  return sendResponse(c, 200, MSG_DOMAIN_MAPPED, result);
}

//  Domain scrape (always async)

export async function handleDomainScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest(await c.req.json(), domainScrapeSchema);
  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);
  const jobId = crypto.randomUUID();
  const triggeredAt = new Date().toISOString();

  const data = await enqueueDomainJob(c.env, {
    jobId,
    triggeredAt,
    domain: body.domain,
    provider,
    maxUrls: body.maxUrls,
    concurrency: body.concurrency,
    waitMs: body.waitMs,
    useBrowser: body.useBrowser,
    maxRetries: body.maxRetries,
    webhookUrl: body.webhookUrl,
    metadata: body.metadata,
  });

  return sendResponse(c, 202, MSG_SCRAPE_QUEUED, data);
}

//  PDF scrape

export async function handlePdfScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest(await c.req.json(), pdfScrapeSchema);

  const result = await scrapePdfUrl({ url: body.url, maxRetries: body.maxRetries, timeoutMs: body.timeoutMs, metadata: body.metadata });

  return sendResponse(c, 200, MSG_PDF_SCRAPED, result);
}
