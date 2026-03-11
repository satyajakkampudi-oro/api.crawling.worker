import type { ProviderName } from "./env-types.js";

export interface ScrapeResult {
  url: string;
  hostname: string;
  markdown: string | null;
  statusCode: number;
  error?: string;
  provider: string;
  durationMs: number;
}

export interface FailedUrl {
  url: string;
  reason: string;
}

export interface ScrapeMetadata {
  clientId?: string;
  tags?: string[];
  context?: string;
  [key: string]: unknown;
}

export interface BatchScrapeOptions {
  urls: string[];
  provider: ProviderName;
  concurrency: number;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  metadata: ScrapeMetadata;
}

export interface SingleScrapeOptions {
  url: string;
  provider: ProviderName;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  metadata: ScrapeMetadata;
}

export type ScrapeStatus = "completed" | "partial" | "failed";

export interface BatchJobResponse {
  jobId: string;
  mode: "async" | "sync";
  status: string;
  urlCount: number;
  successCount: number | null;
  failedCount: number | null;
  results: ScrapeResult[] | null;
}
