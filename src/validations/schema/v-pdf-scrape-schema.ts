import { z } from "zod";

export const pdfScrapeSchema = z.object({
  url: z.string().url("Must be a valid PDF URL"),
  maxRetries: z.number().int().min(0).max(5).optional().default(2),
  timeoutMs: z.number().int().min(1_000).max(60_000).optional().default(30_000),
  metadata: z
    .record(z.unknown())
    .optional()
    .default({}),
});

export type PdfScrapeInput = z.infer<typeof pdfScrapeSchema>;
