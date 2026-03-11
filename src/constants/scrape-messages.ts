// ── Success ───────────────────────────────────────────────────────────────────
export const MSG_SCRAPE_QUEUED = "Scrape job queued. Results will be delivered to your webhook.";
export const MSG_SCRAPE_COMPLETE = "Scrape completed successfully.";
export const MSG_PDF_SCRAPED = "PDF scraped successfully.";
export const MSG_DOMAIN_MAPPED = "Domain URLs mapped successfully.";
export const MSG_HEALTH_OK = "api.scraping is healthy.";

// ── Validation ────────────────────────────────────────────────────────────────
export const MSG_INVALID_URL = "One or more URLs are invalid.";
export const MSG_INVALID_PROVIDER = "Unsupported provider. Use: bee | ant | firecrawl.";
export const MSG_MISSING_WEBHOOK = "webhookUrl is required for async batch jobs.";
export const MSG_BATCH_LIMIT_EXCEEDED = "Batch limit is 50 URLs per request.";

// ── Auth ──────────────────────────────────────────────────────────────────────
export const MSG_UNAUTHORIZED = "Invalid or missing service token.";

// ── Provider ──────────────────────────────────────────────────────────────────
export const MSG_PROVIDER_KEY_MISSING = "Provider API key is not configured.";
export const MSG_ALL_URLS_FAILED = "All URLs failed to scrape.";
export const MSG_PROVIDER_RATE_LIMITED = "Provider rate limit reached. Retry after backoff.";
export const MSG_PROVIDER_CREDITS_EXHAUSTED = "Provider credits exhausted. Upgrade your plan.";

// ── Webhook ───────────────────────────────────────────────────────────────────
export const MSG_WEBHOOK_DELIVERED = "Webhook delivered successfully.";
export const MSG_WEBHOOK_FAILED = "Webhook delivery failed after max retries.";
