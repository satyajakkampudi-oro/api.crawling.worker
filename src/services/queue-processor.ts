import type { AppEnv, ProviderName } from "../types/env-types.js";
import type { ScrapeMetadata } from "../types/scrape-types.js";

import { runBatchScrape } from "./batch-scrape-service.js";
import { mapDomainUrls } from "./domain-map-service.js";
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
 * resolves URLs → scrapes → delivers webhook.
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

  try {
    const urls = await resolveUrlsForMessage(body, bindings);

    if (urls.length === 0) {
      console.warn("[QUEUE] No URLs to scrape", { jobId });
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

    const results = await runBatchScrape(
      { urls, provider, concurrency, waitMs, useBrowser, maxRetries, metadata },
      bindings,
    );

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
    console.warn("[QUEUE] Message processed", { jobId, resultCount: results.length });
  }
  catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[QUEUE] Message processing failed", { jobId, error });
    message.retry();
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
