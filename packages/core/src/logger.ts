import pino from 'pino';
import { join } from 'node:path';
import { getDataDir } from './config.js';

let logger: pino.Logger | undefined;

export function getLogger(name?: string): pino.Logger {
  if (!logger) {
    const dataDir = getDataDir();
    logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        targets: [
          {
            target: 'pino/file',
            options: { destination: join(dataDir, 'logs', 'app.log'), mkdir: true },
            level: 'debug',
          },
          {
            target: 'pino/file',
            options: { destination: 1 },
            level: 'info',
          },
        ],
      },
    });
  }

  return name ? logger.child({ name }) : logger;
}
