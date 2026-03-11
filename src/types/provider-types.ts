import type { ProviderName } from "./env-types.js";
import type { ScrapeResult } from "./scrape-types.js";

export interface ProviderScrapeOptions {
  url: string;
  apiKey: string;
  baseUrl: string;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  timeoutMs: number;
}

export interface ProviderBatchOptions {
  urls: string[];
  apiKey: string;
  baseUrl: string;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  maxConcurrency: number;
}

export type ScrapeUrlFn = (options: ProviderScrapeOptions) => Promise<ScrapeResult>;

export interface ProviderAdapter {
  name: ProviderName;
  executionMode: "sync-parallel" | "native-batch-async";
  scrapeUrl: ScrapeUrlFn;
}
