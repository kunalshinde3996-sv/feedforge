import { Router } from 'express';
import { config } from '../config.js';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    llm: { provider: config.LLM_PROVIDER, model: config.LLM_MODEL ?? null, fallbackModel: config.LLM_FALLBACK_MODEL ?? null },
    phase: 1,
  });
});
