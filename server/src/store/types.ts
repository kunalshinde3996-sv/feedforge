import type { Job } from '../schemas/job.js';

/** Job persistence. Phase 1: JSON files. Phase 2: Postgres. */
export interface JobStore {
  init(): Promise<void>;
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  /** Newest first. */
  list(): Promise<Job[]>;
  /** Apply `mutate` to the current job and persist atomically. Returns the updated job. */
  update(id: string, mutate: (job: Job) => void): Promise<Job>;
}
