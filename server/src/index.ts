import { config } from './config.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();

app.listen(config.PORT, () => {
  logger.info('server started', {
    port: config.PORT,
    env: config.NODE_ENV,
    llmProvider: config.LLM_PROVIDER,
    llmModel: config.LLM_MODEL ?? '(not set)',
  });
});
