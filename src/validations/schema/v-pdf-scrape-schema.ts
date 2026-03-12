import { z } from "zod";

export const pdfScrapeSchema = z.object({
  url: z.string().url("Must be a valid URL pointing to a PDF file"),
  metadata: z
    .record(z.unknown())
    .optional()
    .default({}),
});

export type PdfScrapeInput = z.infer<typeof pdfScrapeSchema>;
