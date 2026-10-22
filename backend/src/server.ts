import { app } from './app.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const server = app.listen(config.port, () => {
  logger.info(`TasteAudit API server listening on http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Qloo Base URL: ${config.qloo.baseUrl}`);
  logger.info(`Qloo Credentials: ${config.qloo.apiKey ? 'Configured' : 'Not configured (Scaffold mode)'}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received. Closing HTTP server...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received. Closing HTTP server...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});
