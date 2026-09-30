import type { Job } from '../schemas/job.js';
import type { JobStore } from './types.js';

/** In-memory store; also the cache layer for FileJobStore. */
export class MemoryJobStore implements JobStore {
  protected jobs = new Map<string, Job>();

  async init() {}

  async create(job: Job) {
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }

  async get(id: string) {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  async list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((j) => structuredClone(j));
  }

  async update(id: string, mutate: (job: Job) => void) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    mutate(job);
    job.updatedAt = new Date().toISOString();
    return structuredClone(job);
  }
}
