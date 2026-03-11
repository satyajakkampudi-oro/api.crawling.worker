import type { ScrapeMetadata, ScrapeResult, ScrapeStatus } from "./scrape-types.js";

export interface WebhookPayload {
  jobId: string;
  status: ScrapeStatus;
  results: ScrapeResult[];
  successCount: number;
  failedCount: number;
  metadata: ScrapeMetadata;
  triggeredAt: string;
  completedAt: string;
  signature: string;
}

export interface WebhookDeliveryOptions {
  webhookUrl: string;
  payload: WebhookPayload;
  secret: string;
  maxRetries: number;
  retryBaseMs: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  attempts: number;
  finalStatusCode?: number;
  error?: string;
}
