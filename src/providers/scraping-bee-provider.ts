import type { ProviderScrapeOptions } from "../types/provider-types.js";

import type { ScrapeResult } from "../types/scrape-types.js";
import ScrapingBee from "scrapingbee";

import { computeBackoffMs, isRetryableStatus, mapHttpStatusToReason } from "../helpers/error-mapping-helper.js";
import { sleep } from "../helpers/retry-helper.js";
import { buildScrapeResult, decodeResponseBytes } from "../helpers/scrape-result-helper.js";

/**
 * Scrapes a single URL using the ScrapingBee API.
 * Handles JS rendering, retries on transient errors, and returns a normalised ScrapeResult.
 */
export async function scrapeUrlWithBee(options: ProviderScrapeOptions): Promise<ScrapeResult> {
  const { url, apiKey, waitMs, useBrowser, maxRetries, timeoutMs } = options;
  const startedAt = Date.now();
  const client = new ScrapingBee.ScrapingBeeClient(apiKey);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await client.get({
        url,
        params: {
          return_page_markdown: true,
          render_js: useBrowser,
          wait: waitMs,
          timeout: timeoutMs,
        },
      });

      const statusCode = response.status ?? 200;

      if (statusCode < 200 || statusCode >= 300) {
        if (isRetryableStatus(statusCode) && attempt <= maxRetries) {
          const delayMs = computeBackoffMs(attempt, 500);
          console.warn("[BEE] Retryable status, backing off", { url, statusCode, attempt, delayMs });
          await sleep(delayMs);
          continue;
        }
        const reason = mapHttpStatusToReason(statusCode);
        return buildScrapeResult({ url, provider: "bee", markdown: null, statusCode, durationMs: Date.now() - startedAt, error: reason });
      }

      const markdown = decodeResponseBytes(response.data);
      if (markdown === null) {
        return buildScrapeResult({ url, provider: "bee", markdown: null, statusCode, durationMs: Date.now() - startedAt, error: "Empty or undecodable content received" });
      }

      return buildScrapeResult({ url, provider: "bee", markdown, statusCode, durationMs: Date.now() - startedAt });
    }
    catch (err: unknown) {
      const statusCode = (err as Record<string, unknown>)?.status as number | undefined ?? 500;

      if (isRetryableStatus(statusCode) && attempt <= maxRetries) {
        const delayMs = computeBackoffMs(attempt, 500);
        console.warn("[BEE] Error, retrying", { url, statusCode, attempt, delayMs });
        await sleep(delayMs);
        continue;
      }

      const reason = mapHttpStatusToReason(statusCode, err);
      console.error("[BEE] Scrape failed", { url, statusCode, attempt, reason });
      return buildScrapeResult({ url, provider: "bee", markdown: null, statusCode, durationMs: Date.now() - startedAt, error: reason });
    }
  }

  return buildScrapeResult({ url, provider: "bee", markdown: null, statusCode: 500, durationMs: Date.now() - startedAt, error: "Max retries exceeded" });
}
