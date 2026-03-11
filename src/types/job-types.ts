import type { ProviderName } from "../types/env-types.js";

import type { ScrapeMetadata } from "./scrape-types.js";

export type JobStatus = "queued" | "processing" | "completed" | "partial" | "failed";

export type JobType = "batch-scrape" | "domain-scrape";

export interface FailedUrlDetail {
  url: string;
  statusCode: number;
  error: string;
  provider: string;
  durationMs: number;
}

export interface JobRecord {
  jobId: string;
  type: JobType;
  status: JobStatus;
  provider: string;
  triggeredAt: string;
  completedAt: string | null;
  urlCount: number;
  successCount: number | null;
  failedCount: number | null;
  failedUrls: FailedUrlDetail[];
  domain?: string;
  webhookUrl?: string;
  metadata: ScrapeMetadata;
  error: string | null;
}

export interface BatchJobOptions {
  jobId: string;
  triggeredAt: string;
  urls: string[];
  provider: ProviderName;
  concurrency: number;
  waitMs: number;
  useBrowser: boolean;
  maxRetries: number;
  webhookUrl?: string | undefined;
  metadata: ScrapeMetadata;
}
