import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Job } from '../schemas/job.js';
import { logger } from '../lib/logger.js';
import { MemoryJobStore } from './memoryStore.js';

/**
 * One JSON file per job in `<dataDir>/jobs/<id>.json`, written atomically (tmp + rename).
 * Reads are served from memory; files are loaded once at boot.
 */
export class FileJobStore extends MemoryJobStore {
  private readonly dir: string;
  private writes = new Map<string, Promise<void>>();

  constructor(dataDir: string) {
    super();
    this.dir = path.resolve(dataDir, 'jobs');
  }

  override async init() {
    await mkdir(this.dir, { recursive: true });
    for (const file of await readdir(this.dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const job = JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as Job;
        this.jobs.set(job.id, job);
      } catch (err) {
        logger.warn('skipping unreadable job file', { file, error: String(err) });
      }
    }
    logger.info('job store loaded', { dir: this.dir, jobs: this.jobs.size });
  }

  override async create(job: Job) {
    const created = await super.create(job);
    await this.persist(created);
    return created;
  }

  override async update(id: string, mutate: (job: Job) => void) {
    const updated = await super.update(id, mutate);
    await this.persist(updated);
    return updated;
  }

  /** Serialise writes per job so a slow write can never overwrite a newer one. */
  private persist(job: Job): Promise<void> {
    const prev = this.writes.get(job.id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const file = path.join(this.dir, `${job.id}.json`);
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(job, null, 2), 'utf8');
      await rename(tmp, file);
    });
    this.writes.set(
      job.id,
      next.catch(() => undefined),
    );
    return next;
  }
}
