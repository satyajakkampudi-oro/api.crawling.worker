import type { ProviderScrapeOptions } from "../types/provider-types.js";

import type { ScrapeResult } from "../types/scrape-types.js";
import Firecrawl from "@mendable/firecrawl-js";

import { mapHttpStatusToReason } from "../helpers/error-mapping-helper.js";
import { buildScrapeResult } from "../helpers/scrape-result-helper.js";

interface FirecrawlScrapeResponse {
  success: boolean;
  markdown?: string;
  error?: string;
}

/**
 * Scrapes a single URL using the Firecrawl /scrape endpoint.
 * Firecrawl manages its own concurrency internally — no p-limit needed here.
 */
export async function scrapeUrlWithFirecrawl(options: ProviderScrapeOptions): Promise<ScrapeResult> {
  const { url, apiKey, timeoutMs } = options;
  const startedAt = Date.now();
  const client = new Firecrawl({ apiKey });
  const isPdf = url.toLowerCase().endsWith(".pdf");

  try {
    const raw = await withTimeout(
      client.scrape(url, { formats: ["markdown"], ...(isPdf && { parsePDF: true }) }),
      timeoutMs,
    );

    const response = raw as FirecrawlScrapeResponse;

    if (!response.success) {
      const reason = response.error ?? "Firecrawl returned unsuccessful status";
      console.warn("[FIRECRAWL] Unsuccessful response", { url, reason });
      return buildScrapeResult({
        url,
        provider: "firecrawl",
        markdown: null,
        statusCode: 422,
        durationMs: Date.now() - startedAt,
        error: reason,
      });
    }

    const markdown = response.markdown ?? null;

    if (markdown === null || markdown.trim().length === 0) {
      return buildScrapeResult({
        url,
        provider: "firecrawl",
        markdown: null,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        error: "Empty content received",
      });
    }

    return buildScrapeResult({
      url,
      provider: "firecrawl",
      markdown,
      statusCode: 200,
      durationMs: Date.now() - startedAt,
    });
  }
  catch (err: unknown) {
    const reason = mapHttpStatusToReason(500, err);
    console.error("[FIRECRAWL] Scrape error", { url, reason });
    return buildScrapeResult({
      url,
      provider: "firecrawl",
      markdown: null,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      error: reason,
    });
  }
}

/**
 * Wraps a promise with a hard timeout.
 * Rejects with a timeout error after `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firecrawl request timed out after ${ms}ms`)), ms),
    ),
  ]);
}
