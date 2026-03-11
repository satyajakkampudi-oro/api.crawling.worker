import type { AppEnv } from "../types/env-types.js";

import type { BatchScrapeOptions, ScrapeResult } from "../types/scrape-types.js";
import { HTTPException } from "hono/http-exception";

import { resolveProviderAdapter } from "../config/provider-registry.js";
import { resolveProviderConfigs } from "../config/providers-config.js";
import { clampConcurrency, runConcurrent } from "../helpers/concurrency-helper.js";
import { partitionResults } from "../helpers/scrape-result-helper.js";

/**
 * Executes a batch scrape using the selected provider and concurrency settings.
 * Results are returned in the same order as the input URL list.
 */
export async function runBatchScrape(
  options: BatchScrapeOptions,
  bindings: AppEnv["Bindings"],
): Promise<ScrapeResult[]> {
  const { urls, provider, concurrency, waitMs, useBrowser, maxRetries } = options;

  const configs = resolveProviderConfigs(bindings);
  const adapter = resolveProviderAdapter(provider);
  const config = configs[provider];

  if (!config.apiKey || config.apiKey.trim().length === 0) {
    throw new HTTPException(503, {
      message: `Provider "${provider}" API key is not configured.`,
    });
  }

  const effectiveConcurrency = clampConcurrency(concurrency, 1, 5);

  console.warn("[BATCH] Starting", {
    urlCount: urls.length,
    provider,
    concurrency: effectiveConcurrency,
  });

  const tasks = urls.map(url => () =>
    adapter.scrapeUrl({
      url,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      waitMs: waitMs ?? config.waitMs,
      useBrowser,
      maxRetries: maxRetries ?? config.maxRetries,
      timeoutMs: config.timeoutMs,
    }),
  );

  const results = await runConcurrent({
    tasks,
    concurrency: effectiveConcurrency,
    onTaskComplete: (result, index) => {
      const success = result.markdown !== null;
      console.warn("[BATCH] URL done", {
        index,
        url: result.url,
        success,
        durationMs: result.durationMs,
      });
    },
  });

  const { successful, failed } = partitionResults(results);

  console.warn("[BATCH] Complete", {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    provider,
  });

  return results;
}

/**
 * Determines whether a batch job should run synchronously (return results inline)
 * or asynchronously (enqueue and return a jobId).
 */
export function determineBatchMode(
  urlCount: number,
  webhookUrl: string | undefined,
  syncThreshold: string,
): "sync" | "async" {
  const threshold = Number(syncThreshold ?? 10);
  if (webhookUrl !== undefined && webhookUrl.length > 0)
    return "async";
  if (urlCount > threshold)
    return "async";
  return "sync";
}
