import { EventEmitter } from 'node:events';
import type { Job } from '../schemas/job.js';

/** In-process pub/sub for job updates (feeds SSE). Phase 2: Redis pub/sub or BullMQ QueueEvents. */
export class JobEvents {
  private emitter = new EventEmitter().setMaxListeners(0);

  publish(job: Job) {
    this.emitter.emit(`job:${job.id}`, job);
    this.emitter.emit('job', job);
  }

  subscribe(jobId: string, listener: (job: Job) => void): () => void {
    this.emitter.on(`job:${jobId}`, listener);
    return () => this.emitter.off(`job:${jobId}`, listener);
  }

  subscribeAll(listener: (job: Job) => void): () => void {
    this.emitter.on('job', listener);
    return () => this.emitter.off('job', listener);
  }
}
