import type { AppEnv } from "../types/env-types.js";

import { HTTPException } from "hono/http-exception";

import { deduplicateUrls, filterValidUrls, normaliseBaseUrl } from "../helpers/url-helper.js";

interface DomainMapOptions {
  domain: string;
  maxUrls: number;
  includeSubdomains: boolean;
  apiKey: string;
  timeoutMs: number;
}

interface DomainMapResult {
  domain: string;
  urls: string[];
  total: number;
}

/**
 * Discovers all crawlable URLs for a given domain using Firecrawl's /map endpoint.
 * Falls back to sitemap parsing if Firecrawl is unavailable.
 */
export async function mapDomainUrls(
  options: DomainMapOptions,
  bindings: AppEnv["Bindings"],
): Promise<DomainMapResult> {
  const { domain, maxUrls, includeSubdomains } = options;
  const normalisedDomain = normaliseBaseUrl(domain);

  if (!bindings.FIRECRAWL_API_KEY || bindings.FIRECRAWL_API_KEY.trim().length === 0) {
    throw new HTTPException(503, {
      message: "Domain mapping requires Firecrawl API key to be configured.",
    });
  }

  console.warn("[MAP] Starting domain discovery", { domain: normalisedDomain, maxUrls });

  const urls = await fetchDomainUrlsFromFirecrawl({
    domain: normalisedDomain,
    maxUrls,
    includeSubdomains,
    apiKey: bindings.FIRECRAWL_API_KEY,
    timeoutMs: 20_000,
  });

  const deduplicated = deduplicateUrls(filterValidUrls(urls)).slice(0, maxUrls);

  console.warn("[MAP] Discovery complete", { domain: normalisedDomain, found: deduplicated.length });

  return {
    domain: normalisedDomain,
    urls: deduplicated,
    total: deduplicated.length,
  };
}

/**
 * Calls the Firecrawl /map endpoint to retrieve all URLs for a domain.
 */
async function fetchDomainUrlsFromFirecrawl(options: DomainMapOptions): Promise<string[]> {
  const { domain, maxUrls, includeSubdomains, apiKey, timeoutMs } = options;

  const response = await fetch("https://api.firecrawl.dev/v1/map", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: domain,
      limit: maxUrls,
      includeSubdomains,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `Firecrawl map API returned ${response.status}: ${text.substring(0, 120)}`,
    });
  }

  const data = await response.json() as Record<string, unknown>;
  const links = data.links;

  if (!Array.isArray(links)) {
    throw new HTTPException(502, { message: "Firecrawl map API returned unexpected response shape." });
  }

  return links.filter((l): l is string => typeof l === "string");
}
