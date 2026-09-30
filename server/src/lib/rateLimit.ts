import type { RequestHandler } from 'express';
import { errorBody } from './errors.js';

/** Fixed-window, per-IP, in-memory rate limiter. Good enough for a single instance. */
export function rateLimit(opts: { max: number; windowMs: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const t = Date.now();
    for (const [ip, h] of hits) if (h.resetAt <= t) hits.delete(ip);
  }, opts.windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const t = Date.now();
    let h = hits.get(ip);
    if (!h || h.resetAt <= t) {
      h = { count: 0, resetAt: t + opts.windowMs };
      hits.set(ip, h);
    }
    h.count++;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - h.count)));
    if (h.count > opts.max) {
      const retryAfter = Math.ceil((h.resetAt - t) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res
        .status(429)
        .json(errorBody('RATE_LIMITED', `Too many jobs created. Try again in ${retryAfter}s.`));
      return;
    }
    next();
  };
}
