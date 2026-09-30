import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { JobEvents } from '../src/lib/events.js';
import { MemoryJobStore } from '../src/store/memoryStore.js';
import { listen } from './helpers.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'ff-web-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  const app = createApp({
    store: new MemoryJobStore(),
    events: new JobEvents(),
    pipeline: null,
    rateLimit: { max: 10, windowMs: 60_000 },
    webDist: dist,
  });
  ({ server, base } = await listen(app));
});

afterAll(() => server.close());

describe('production static serving', () => {
  it('serves index.html at / with no-cache', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('id="root"');
  });

  it('serves hashed assets with immutable caching', async () => {
    const res = await fetch(`${base}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
  });

  it('falls back to index.html for unknown non-API routes', async () => {
    const res = await fetch(`${base}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  it('keeps JSON 404s for unknown /api routes', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('API still works alongside the dashboard', async () => {
    const res = await fetch(`${base}/api/health`);
    expect((await res.json()).status).toBe('ok');
  });
});
