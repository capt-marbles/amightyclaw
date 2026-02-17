import express from 'express';
import { createServer as createHTTPServer } from 'node:http';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import { getDatabase, ConversationStore, FactStore, UsageStore } from '@amightyclaw/memory';
import { ProviderRegistry } from '@amightyclaw/providers';
import { MessageBus, AgentLoop } from '@amightyclaw/agent';
import { SoulService } from '@amightyclaw/soul';
import { SchedulerService } from '@amightyclaw/scheduler';
import { createAuthRouter, createAuthMiddleware } from './auth.js';
import { createSocketServer } from './socket.js';

const log = getLogger('gateway');
const startTime = Date.now();

interface ServerHandle {
  close(): Promise<void>;
}

export async function createServer(config: AppConfig): Promise<ServerHandle> {
  const app = express();
  const httpServer = createHTTPServer(app);

  // Initialize database
  getDatabase();

  // Initialize services
  const conversations = new ConversationStore();
  const facts = new FactStore();
  const usage = new UsageStore();
  const providers = new ProviderRegistry(config);
  const soul = new SoulService();
  soul.load();
  soul.startWatching();

  const bus = new MessageBus();
  const agent = new AgentLoop(config, bus, providers, soul, conversations, facts, usage);
  agent.start();

  const scheduler = new SchedulerService(config);
  await scheduler.init();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", `ws://${config.host}:${config.port}`],
      },
    },
  }));
  app.use(cors({ origin: `http://${config.host}:${config.port}` }));
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts' },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Rate limit exceeded' },
  });

  // Routes
  app.use('/api/auth', loginLimiter, createAuthRouter(config));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      profiles: Object.keys(config.profiles),
    });
  });

  // Protected API routes
  const authMw = createAuthMiddleware(config);
  app.use('/api', apiLimiter, authMw);

  app.get('/api/conversations', (_req, res) => {
    res.json(conversations.list());
  });

  app.get('/api/conversations/:id/messages', (req, res) => {
    const msgs = conversations.getMessages(req.params.id);
    res.json(msgs);
  });

  app.get('/api/usage/:profile', (req, res) => {
    const dailyUsage = usage.getDailyUsage(req.params.profile);
    const profileConfig = config.profiles[req.params.profile];
    res.json({
      profile: req.params.profile,
      used: dailyUsage,
      limit: profileConfig?.maxTokensPerDay || 0,
      remaining: Math.max(0, (profileConfig?.maxTokensPerDay || 0) - dailyUsage),
    });
  });

  app.get('/api/profiles', (_req, res) => {
    const profiles = Object.entries(config.profiles).map(([name, p]) => ({
      name,
      provider: p.provider,
      model: p.model,
      maxTokensPerMessage: p.maxTokensPerMessage,
      maxTokensPerDay: p.maxTokensPerDay,
    }));
    res.json(profiles);
  });

  // Scheduler API
  app.get('/api/cron', (_req, res) => {
    res.json(scheduler.listJobs());
  });

  app.post('/api/cron', async (req, res) => {
    try {
      const job = await scheduler.addJob(req.body);
      res.status(201).json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete('/api/cron/:name', async (req, res) => {
    try {
      await scheduler.removeJob(req.params.name);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Serve static webchat UI
  const uiDistPath = join(import.meta.dirname || '.', '..', '..', '..', 'ui', 'webchat', 'dist');
  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(uiDistPath, 'index.html'));
    });
  }

  // Socket.IO
  createSocketServer(httpServer, config, bus, conversations);

  // Start listening
  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, config.host, () => {
      log.info({ port: config.port, host: config.host }, 'Server started');
      console.log(`\n🐾 AMightyClaw running at http://${config.host}:${config.port}\n`);
      resolve();
    });
  });

  return {
    async close() {
      soul.stopWatching();
      await scheduler.stop();
      httpServer.close();
      const { closeDatabase } = await import('@amightyclaw/memory');
      closeDatabase();
      log.info('Server stopped');
    },
  };
}
