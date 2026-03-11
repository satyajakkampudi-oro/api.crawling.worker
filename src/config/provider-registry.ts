import type { ProviderName } from "../types/env-types.js";
import type { ProviderAdapter } from "../types/provider-types.js";

import { scrapeUrlWithFirecrawl } from "../providers/firecrawl-provider.js";
import { scrapeUrlWithAnt } from "../providers/scraping-ant-provider.js";
import { scrapeUrlWithBee } from "../providers/scraping-bee-provider.js";

/**
 * Central registry of all scraping provider adapters.
 * To add a new provider: implement ScrapeUrlFn and register it here.
 * Zero other files need to change.
 */
const PROVIDER_REGISTRY: Record<ProviderName, ProviderAdapter> = {
  bee: {
    name: "bee",
    executionMode: "sync-parallel",
    scrapeUrl: scrapeUrlWithBee,
  },
  ant: {
    name: "ant",
    executionMode: "sync-parallel",
    scrapeUrl: scrapeUrlWithAnt,
  },
  firecrawl: {
    name: "firecrawl",
    executionMode: "sync-parallel",
    scrapeUrl: scrapeUrlWithFirecrawl,
  },
};

/**
 * Resolves the adapter for a given provider name.
 * Throws if the provider is not registered (should never happen given Zod validation upstream).
 */
export function resolveProviderAdapter(name: ProviderName): ProviderAdapter {
  const adapter = PROVIDER_REGISTRY[name];
  if (adapter === undefined) {
    throw new Error(`[REGISTRY] Unknown provider: ${name}`);
  }
  return adapter;
}
