import { loadConfig, getLogger } from '@amightyclaw/core';

interface StartOptions {
  port?: string;
}

export async function startCommand(opts: StartOptions): Promise<void> {
  const config = loadConfig();
  const port = opts.port ? parseInt(opts.port, 10) : config.port;
  const log = getLogger('cli');

  log.info({ port }, 'Starting AMightyClaw server...');

  const { createServer } = await import('@amightyclaw/gateway');
  const server = await createServer({ ...config, port });

  const shutdown = async () => {
    log.info('Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
