import type { AppEnv, ProviderName } from "../types/env-types.js";
import type { ScrapeMetadata } from "../types/scrape-types.js";

import { deriveScrapeStatus } from "../helpers/scrape-result-helper.js";
import { runBatchScrape } from "./batch-scrape-service.js";
import { mapDomainUrls } from "./domain-map-service.js";
import { extractFailedUrls, updateJobRecord } from "./job-store-service.js";
import { buildFailurePayload, deliverScrapeResult, resolveWebhookConfig } from "./webhook-delivery-service.js";

interface BatchScrapeQueueMessage {
  type?: "batch-scrape" | "domain-scrape";
  jobId: string;
  triggeredAt: string;
  urls?: string[];
  domain?: string;
  provider: ProviderName;
  concurrency: number;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  maxUrls?: number;
  webhookUrl?: string;
  metadata: ScrapeMetadata;
}

/**
 * Processes a single queue message end-to-end:
 * resolves URLs → scrapes → updates job store → delivers webhook.
 * Each message is self-contained and independently retryable.
 */
export async function processQueueMessage(
  message: Message<unknown>,
  bindings: AppEnv["Bindings"],
): Promise<void> {
  const body = message.body as BatchScrapeQueueMessage;
  const { jobId, triggeredAt, provider, concurrency, waitMs, useBrowser, maxRetries, webhookUrl, metadata } = body;
  const webhookConfig = resolveWebhookConfig(bindings);

  console.warn("[QUEUE] Processing message", { jobId, type: body.type ?? "batch-scrape" });

  // Mark job as processing
  await updateJobRecord(bindings.SCRAPE_JOB_STORE, jobId, { status: "processing" });

  let urls: string[];

  // Phase 1: URL resolution — retryable (no scraping has happened yet)
  try {
    urls = await resolveUrlsForMessage(body, bindings);
  }
  catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[QUEUE] URL resolution failed — will retry", { jobId, error });
    message.retry();
    return;
  }

  if (urls.length === 0) {
    console.warn("[QUEUE] No URLs to scrape", { jobId });
    await updateJobRecord(bindings.SCRAPE_JOB_STORE, jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      successCount: 0,
      failedCount: 0,
      error: "No URLs resolved for this job.",
    });
    if (webhookUrl !== undefined) {
      const payload = await buildFailurePayload(jobId, triggeredAt, metadata, webhookConfig.secret);
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Scraping-Signature": payload.signature },
        body: JSON.stringify(payload),
      });
    }
    message.ack();
    return;
  }

  // Phase 2: Scrape + record + webhook — ack regardless (no re-scraping on retry)
  try {
    const results = await runBatchScrape(
      { urls, provider, concurrency, waitMs, useBrowser, maxRetries, metadata },
      bindings,
    );

    const completedAt = new Date().toISOString();
    const status = deriveScrapeStatus(results);
    const successCount = results.filter(r => r.markdown !== null && r.error === undefined).length;
    const failedCount = results.length - successCount;
    const failedUrls = extractFailedUrls(results);

    await updateJobRecord(bindings.SCRAPE_JOB_STORE, jobId, {
      status,
      completedAt,
      successCount,
      failedCount,
      failedUrls,
    });

    if (webhookUrl !== undefined) {
      await deliverScrapeResult({
        jobId,
        webhookUrl,
        results,
        metadata,
        triggeredAt,
        webhookSecret: webhookConfig.secret,
        maxRetries: webhookConfig.maxRetries,
        retryBaseMs: webhookConfig.retryBaseMs,
      });
    }

    message.ack();
    console.warn("[QUEUE] Message processed", { jobId, status, resultCount: results.length });
  }
  catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[QUEUE] Scrape phase failed — acking to prevent re-scrape", { jobId, error });

    await updateJobRecord(bindings.SCRAPE_JOB_STORE, jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error,
    });

    // Ack (not retry) — scraping may have partially completed.
    // Re-delivering would re-scrape all URLs and waste provider credits.
    message.ack();
  }
}

/**
 * Resolves the list of URLs to scrape from a queue message.
 * For batch-scrape messages, uses the provided URL list directly.
 * For domain-scrape messages, runs domain discovery first.
 */
async function resolveUrlsForMessage(
  body: BatchScrapeQueueMessage,
  bindings: AppEnv["Bindings"],
): Promise<string[]> {
  if (body.type === "domain-scrape" && body.domain !== undefined) {
    const mapResult = await mapDomainUrls(
      {
        domain: body.domain,
        maxUrls: body.maxUrls ?? 100,
        includeSubdomains: false,
        apiKey: bindings.FIRECRAWL_API_KEY,
        timeoutMs: 20_000,
      },
      bindings,
    );
    return mapResult.urls;
  }

  return body.urls ?? [];
}
