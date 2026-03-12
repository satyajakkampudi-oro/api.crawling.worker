import type { ZodTypeAny } from "zod";

import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { batchScrapeSchema } from "./schema/v-batch-scrape-schema.js";
import { domainMapSchema, domainScrapeSchema } from "./schema/v-domain-map-schema.js";
import { pdfScrapeSchema } from "./schema/v-pdf-scrape-schema.js";
import { singleScrapeSchema } from "./schema/v-single-scrape-schema.js";

// ── Activity type ──────────────────────────────────────────────────────────────

export type ScrapeActivity
  = | "single-scrape"
    | "batch-scrape"
    | "domain-map"
    | "domain-scrape"
    | "pdf-scrape";

// ── Validate ──────────────────────────────────────────────────────────────────

export async function validateRequest<R>(
  actionType: ScrapeActivity,
  reqData: unknown,
  errorMessage: string,
): Promise<R> {
  let schema: ZodTypeAny | undefined;

  switch (actionType) {
    case "single-scrape":
      schema = singleScrapeSchema;
      break;
    case "batch-scrape":
      schema = batchScrapeSchema;
      break;
    case "domain-map":
      schema = domainMapSchema;
      break;
    case "domain-scrape":
      schema = domainScrapeSchema;
      break;
    case "pdf-scrape":
      schema = pdfScrapeSchema;
      break;
  }

  if (!schema) {
    throw new Error(`No schema registered for action type: ${actionType}`);
  }

  const validation = await schema.safeParseAsync(reqData);

  if (!validation.success) {
    throw UnprocessableEntityException(errorMessage, getValidationErrors(validation.error.errors));
  }

  return validation.data as R;
}

// ── Field error formatter ──────────────────────────────────────────────────────

function getValidationErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    const field = issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : "root";
    if (!errors[field])
      errors[field] = [];
    errors[field].push(issue.message);
  }

  return errors;
}
