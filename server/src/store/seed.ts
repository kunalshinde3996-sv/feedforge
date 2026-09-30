import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../lib/logger.js';
import { ScriptPlanSchema } from '../schemas/plan.js';
import type { Job } from '../schemas/job.js';
import type { JobStore } from './types.js';

/**
 * If the store has no passed job (fresh Render deploy, wiped disk), load the real passed runs
 * from /examples as completed jobs flagged `sample: true`, so the dashboard is never empty.
 * Returns how many were seeded.
 */
export async function seedSampleRuns(store: JobStore, examplesDir: string): Promise<number> {
  const existing = await store.list();
  if (existing.some((j) => j.status === 'passed')) return 0;

  let files: string[];
  try {
    files = (await readdir(examplesDir)).filter((f) => f.endsWith('.json'));
  } catch {
    logger.warn('no examples directory to seed from', { dir: examplesDir });
    return 0;
  }

  const ids = new Set(existing.map((j) => j.id));
  let seeded = 0;
  for (const file of files) {
    try {
      const job = JSON.parse(await readFile(path.join(examplesDir, file), 'utf8')) as Job;
      // Only real, completed, well-formed runs.
      if (job.status !== 'passed' || !job.id || ids.has(job.id)) continue;
      if (!ScriptPlanSchema.safeParse(job.finalPlan).success) continue;
      await store.create({ ...job, sample: true });
      seeded++;
    } catch (err) {
      logger.warn('skipping invalid example', { file, error: String(err) });
    }
  }
  if (seeded) logger.info('seeded sample runs', { count: seeded, dir: examplesDir });
  return seeded;
}
