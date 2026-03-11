import type { z, ZodTypeAny } from "zod";

import { HTTPException } from "hono/http-exception";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Validates a pre-parsed request body against a Zod schema.
 *
 * Usage in handlers:
 *   const reqBody = await c.req.json();
 *   const body = await validateRequest(reqBody, singleScrapeSchema);
 *
 * Throws `HTTPException(422)` with structured field errors on failure.
 */
export async function validateRequest<S extends ZodTypeAny>(
  rawBody: unknown,
  schema: S,
): Promise<z.infer<S>> {
  const result = schema.safeParse(rawBody);

  if (!result.success) {
    const errors: ValidationError[] = result.error.errors.map(issue => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
    }));

    throw new HTTPException(422, {
      message: `Validation failed: ${errors.map(e => `${e.field} — ${e.message}`).join("; ")}`,
    });
  }

  return result.data as z.infer<S>;
}
