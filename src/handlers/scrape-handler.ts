import type { Context } from "hono";
import type { AppEnv } from "../types/env-types.js";

import type { BatchScrapeInput } from "../validations/schema/v-batch-scrape-schema.js";
import type { DomainMapInput, DomainScrapeInput } from "../validations/schema/v-domain-map-schema.js";
import type { PdfScrapeInput } from "../validations/schema/v-pdf-scrape-schema.js";
import type { SingleScrapeInput } from "../validations/schema/v-single-scrape-schema.js";

import {
  MSG_BATCH_SCRAPE_VALIDATION_ERROR,
  MSG_DOMAIN_MAP_VALIDATION_ERROR,
  MSG_DOMAIN_MAPPED,
  MSG_DOMAIN_SCRAPE_VALIDATION_ERROR,
  MSG_PDF_SCRAPE_VALIDATION_ERROR,
  MSG_PDF_SCRAPED,
  MSG_SCRAPE_COMPLETE,
  MSG_SCRAPE_QUEUED,
  MSG_SINGLE_SCRAPE_VALIDATION_ERROR,
} from "../constants/scrape-messages.js";

import { determineBatchMode, enqueueBatchJob, runSyncBatchScrape } from "../services/batch-scrape-service.js";
import { enqueueDomainJob, mapDomainUrls } from "../services/domain-map-service.js";
import { resolveConcurrency, resolveSingleProvider, scrapeSingleUrl } from "../services/single-scrape-service.js";

import { sendResponse } from "../utils/send-response.js";
import { isPdfUrl } from "../utils/url-utils.js";

import { validateRequest } from "../validations/validate-request.js";

//  Single URL scrape
export async function handleSingleScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest<SingleScrapeInput>("single-scrape", await c.req.json(), MSG_SINGLE_SCRAPE_VALIDATION_ERROR);
  // PDF URLs must always use Firecrawl — it is the only provider with native PDF → markdown support.
  const provider = isPdfUrl(body.url) ? "firecrawl" : resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);

  const result = await scrapeSingleUrl(
    { url: body.url, provider, waitMs: body.waitMs ?? 3000, useBrowser: body.useBrowser, maxRetries: body.maxRetries ?? 2, metadata: body.metadata },
    c.env,
  );

  return sendResponse(c, 200, MSG_SCRAPE_COMPLETE, result);
}

//  Batch scrape

export async function handleBatchScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest<BatchScrapeInput>("batch-scrape", await c.req.json(), MSG_BATCH_SCRAPE_VALIDATION_ERROR);
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
  const body = await validateRequest<DomainMapInput>("domain-map", await c.req.json(), MSG_DOMAIN_MAP_VALIDATION_ERROR);

  const result = await mapDomainUrls(
    { domain: body.domain, maxUrls: body.maxUrls, includeSubdomains: body.includeSubdomains, apiKey: c.env.FIRECRAWL_API_KEY, timeoutMs: 20_000 },
    c.env,
  );

  return sendResponse(c, 200, MSG_DOMAIN_MAPPED, result);
}

//  Domain scrape (always async)

export async function handleDomainScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest<DomainScrapeInput>("domain-scrape", await c.req.json(), MSG_DOMAIN_SCRAPE_VALIDATION_ERROR);
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

//  PDF scrape — provider is always Firecrawl (only provider with native PDF → markdown support)
export async function handlePdfScrape(c: Context<AppEnv>): Promise<Response> {
  const body = await validateRequest<PdfScrapeInput>("pdf-scrape", await c.req.json(), MSG_PDF_SCRAPE_VALIDATION_ERROR);

  const result = await scrapeSingleUrl(
    { url: body.url, provider: "firecrawl", waitMs: 0, useBrowser: false, maxRetries: 0, metadata: body.metadata },
    c.env,
  );

  return sendResponse(c, 200, MSG_PDF_SCRAPED, result);
}
