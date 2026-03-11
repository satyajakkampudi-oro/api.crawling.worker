import type { ScrapeResult } from "../types/scrape-types.js";

import pLimit from "p-limit";

type ScrapeTask = () => Promise<ScrapeResult>;

interface RunConcurrentOptions {
  tasks: ScrapeTask[];
  concurrency: number;
  onTaskComplete?: (result: ScrapeResult, index: number) => void;
}

/**
 * Runs an array of scrape tasks with a maximum concurrency limit.
 * Results are collected in original URL order (Promise.all preserves order).
 */
export async function runConcurrent(options: RunConcurrentOptions): Promise<ScrapeResult[]> {
  const { tasks, concurrency, onTaskComplete } = options;
  const limit = pLimit(concurrency);

  const limitedTasks = tasks.map((task, index) =>
    limit(async () => {
      const result = await task();
      onTaskComplete?.(result, index);
      return result;
    }),
  );

  return Promise.all(limitedTasks);
}

/**
 * Clamps a concurrency value between a minimum and maximum bound.
 * Prevents accidental 0 or excessive concurrency from misconfigured env vars.
 */
export function clampConcurrency(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}
