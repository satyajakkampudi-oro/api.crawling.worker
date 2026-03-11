import type { Context } from "hono";

import type { AppEnv } from "../types/env-types.js";

import {
  MSG_DOMAIN_MAPPED,
  MSG_PDF_SCRAPED,
  MSG_SCRAPE_COMPLETE,
  MSG_SCRAPE_QUEUED,
} from "../constants/scrape-messages.js";

import { deriveScrapeStatus } from "../helpers/scrape-result-helper.js";

import { determineBatchMode, runBatchScrape } from "../services/batch-scrape-service.js";

import { mapDomainUrls } from "../services/domain-map-service.js";
import { scrapePdfUrl } from "../services/pdf-scrape-service.js";

import { resolveConcurrency, resolveSingleProvider, scrapeSingleUrl } from "../services/single-scrape-service.js";

import { deliverScrapeResult, resolveWebhookConfig } from "../services/webhook-delivery-service.js";

import { sendResponse } from "../utils/send-response.js";

import { batchScrapeSchema } from "../validations/schema/v-batch-scrape-schema.js";
import { domainMapSchema, domainScrapeSchema } from "../validations/schema/v-domain-map-schema.js";

import { pdfScrapeSchema } from "../validations/schema/v-pdf-scrape-schema.js";
import { singleScrapeSchema } from "../validations/schema/v-single-scrape-schema.js";

import { validateRequest } from "../validations/validate-request.js";

// Single URL scrape

export async function handleSingleScrape(c: Context<AppEnv>): Promise<Response> {
  const reqBody = await c.req.json();
  const body = await validateRequest(reqBody, singleScrapeSchema);

  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);

  const result = await scrapeSingleUrl(
    {
      url: body.url,
      provider,
      waitMs: body.waitMs ?? 3000,
      useBrowser: body.useBrowser,
      maxRetries: body.maxRetries ?? 2,
      metadata: body.metadata,
    },
    c.env,
  );

  return sendResponse(c, 200, MSG_SCRAPE_COMPLETE, result);
}

// Batch scrape

export async function handleBatchScrape(c: Context<AppEnv>): Promise<Response> {
  const reqBody = await c.req.json();
  const body = await validateRequest(reqBody, batchScrapeSchema);

  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);
  const concurrency = resolveConcurrency(body.concurrency, c.env.SCRAPINGANT_CONCURRENCY);
  const mode = determineBatchMode(body.urls.length, body.webhookUrl, c.env.SYNC_BATCH_THRESHOLD);
  const triggeredAt = new Date().toISOString();
  const jobId = crypto.randomUUID();

  //  Async path: enqueue and return immediately
  if (mode === "async") {
    await c.env.SCRAPE_JOB_QUEUE.send({
      jobId,
      triggeredAt,
      urls: body.urls,
      provider,
      concurrency,
      waitMs: body.waitMs,
      useBrowser: body.useBrowser,
      maxRetries: body.maxRetries,
      webhookUrl: body.webhookUrl,
      metadata: body.metadata,
    });

    return sendResponse(c, 202, MSG_SCRAPE_QUEUED, {
      jobId,
      urlCount: body.urls.length,
      mode: "async",
    });
  }

  // Sync path: scrape inline and return results
  const results = await runBatchScrape(
    {
      urls: body.urls,
      provider,
      concurrency,
      waitMs: body.waitMs,
      useBrowser: body.useBrowser,
      maxRetries: body.maxRetries,
      metadata: body.metadata,
    },
    c.env,
  );

  // Fire-and-forget webhook delivery (non-blocking)
  if (body.webhookUrl !== undefined) {
    const webhookConfig = resolveWebhookConfig(c.env);
    c.executionCtx.waitUntil(
      deliverScrapeResult({
        jobId,
        webhookUrl: body.webhookUrl,
        results,
        metadata: body.metadata,
        triggeredAt,
        webhookSecret: webhookConfig.secret,
        maxRetries: webhookConfig.maxRetries,
        retryBaseMs: webhookConfig.retryBaseMs,
      }),
    );
  }

  return sendResponse(c, 200, MSG_SCRAPE_COMPLETE, {
    jobId,
    status: deriveScrapeStatus(results),
    results,
    successCount: results.filter(r => r.markdown !== null).length,
    failedCount: results.filter(r => r.markdown === null).length,
  });
}

//  Domain URL map

export async function handleDomainMap(c: Context<AppEnv>): Promise<Response> {
  const reqBody = await c.req.json();
  const body = await validateRequest(reqBody, domainMapSchema);

  const result = await mapDomainUrls(
    {
      domain: body.domain,
      maxUrls: body.maxUrls,
      includeSubdomains: body.includeSubdomains,
      apiKey: c.env.FIRECRAWL_API_KEY,
      timeoutMs: 20_000,
    },
    c.env,
  );

  return sendResponse(c, 200, MSG_DOMAIN_MAPPED, result);
}

// Full domain scrape (always async)

export async function handleDomainScrape(c: Context<AppEnv>): Promise<Response> {
  const reqBody = await c.req.json();
  const body = await validateRequest(reqBody, domainScrapeSchema);

  const provider = resolveSingleProvider(body.provider, c.env.DEFAULT_PROVIDER);
  const jobId = crypto.randomUUID();
  const triggeredAt = new Date().toISOString();

  await c.env.SCRAPE_JOB_QUEUE.send({
    jobId,
    triggeredAt,
    type: "domain-scrape",
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

  return sendResponse(c, 202, MSG_SCRAPE_QUEUED, {
    jobId,
    domain: body.domain,
    mode: "async",
  });
}

//  PDF scrape

export async function handlePdfScrape(c: Context<AppEnv>): Promise<Response> {
  const reqBody = await c.req.json();
  const body = await validateRequest(reqBody, pdfScrapeSchema);

  const result = await scrapePdfUrl({
    url: body.url,
    maxRetries: body.maxRetries,
    timeoutMs: body.timeoutMs,
    metadata: body.metadata,
  });

  return sendResponse(c, 200, MSG_PDF_SCRAPED, result);
}
