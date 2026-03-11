import type { ScrapeResult } from "../types/scrape-types.js";

import { HTTPException } from "hono/http-exception";

import { computeBackoffMs, isRetryableStatus } from "../helpers/error-mapping-helper.js";
import { sleep } from "../helpers/retry-helper.js";
import { buildScrapeResult } from "../helpers/scrape-result-helper.js";

// Types

interface PdfScrapeOptions {
  url: string;
  maxRetries: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

interface PdfFetchResult {
  base64: string;
  statusCode: number;
}

//  Public API

/**
 * Fetches a PDF by URL, encodes its bytes as base64, and returns a ScrapeResult.
 * Retries on transient HTTP errors with exponential backoff.
 * Throws `HTTPException(502)` if the URL does not serve a PDF.
 */
export async function scrapePdfUrl(options: PdfScrapeOptions): Promise<ScrapeResult> {
  const { url, maxRetries, timeoutMs } = options;
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const fetched = await fetchPdfBytes(url, timeoutMs);
      const durationMs = Date.now() - startedAt;

      return buildScrapeResult({
        url,
        markdown: fetched.base64,
        statusCode: fetched.statusCode,
        provider: "pdf",
        durationMs,
      });
    }
    catch (err: unknown) {
      lastError = err;
      const status = err instanceof HTTPException ? err.status : 0;
      const retryable = status === 0 || isRetryableStatus(status);

      if (!retryable || attempt > maxRetries)
        break;

      await sleep(computeBackoffMs(attempt, 1_000));
    }
  }

  if (lastError instanceof HTTPException)
    throw lastError;

  throw new HTTPException(502, {
    message: `PDF fetch failed after ${maxRetries + 1} attempt(s)`,
  });
}

// Private

async function fetchPdfBytes(url: string, timeoutMs: number): Promise<PdfFetchResult> {
  const response = await fetch(url, {
    headers: { Accept: "application/pdf,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new HTTPException(response.status as never, {
      message: `PDF fetch failed with status ${response.status}`,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
    throw new HTTPException(502, {
      message: `URL does not serve a PDF (content-type: ${contentType})`,
    });
  }

  const bytes = await response.arrayBuffer();
  const base64 = encodeArrayBufferToBase64(bytes);

  return { base64, statusCode: response.status };
}

function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return btoa(binary);
}
