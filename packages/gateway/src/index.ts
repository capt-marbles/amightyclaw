import express from 'express';
import { createServer as createHTTPServer } from 'node:http';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '@amightyclaw/core';
import { getLogger, encrypt, saveConfig } from '@amightyclaw/core';
import { getDatabase, ConversationStore, FactStore, UsageStore } from '@amightyclaw/memory';
import { ProviderRegistry } from '@amightyclaw/providers';
import { MessageBus, AgentLoop, ToolRegistry, registerBuiltinTools } from '@amightyclaw/agent';
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

  // Validate provider connections
  for (const profileName of Object.keys(config.profiles)) {
    const result = await providers.validateProfile(profileName);
    if (result.valid) {
      console.log(`  ✅ Profile "${profileName}" — connected`);
    } else {
      console.log(`  ❌ Profile "${profileName}" — ${result.error}`);
    }
  }

  // Tool registry
  const toolRegistry = new ToolRegistry();

  const bus = new MessageBus();
  const scheduler = new SchedulerService(config);
  await scheduler.init();

  const agent = new AgentLoop(config, bus, providers, soul, conversations, facts, usage, toolRegistry);
  agent.start();

  // Register built-in tools (web search, skills, command execution, reminders)
  registerBuiltinTools(toolRegistry, config, agent, scheduler);

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

  // Conversations
  app.get('/api/conversations', (_req, res) => {
    res.json(conversations.list());
  });

  app.get('/api/conversations/:id/messages', (req, res) => {
    const msgs = conversations.getMessages(req.params.id);
    res.json(msgs);
  });

  app.get('/api/conversations/search', (req, res) => {
    const q = req.query.q as string;
    if (!q) { res.json([]); return; }
    res.json(conversations.searchMessages(q));
  });

  // Usage
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

  // Profiles
  app.get('/api/profiles', (_req, res) => {
    const profiles = Object.entries(config.profiles).map(([name, p]) => ({
      name,
      provider: p.provider,
      model: p.model,
      maxTokensPerMessage: p.maxTokensPerMessage,
      maxTokensPerDay: p.maxTokensPerDay,
      temperature: p.temperature,
      topP: p.topP,
      maxHistoryMessages: p.maxHistoryMessages,
    }));
    res.json(profiles);
  });

  app.post('/api/profiles/:name/validate', async (req, res) => {
    const result = await providers.validateProfile(req.params.name);
    res.json(result);
  });

  app.post('/api/profiles', (req, res) => {
    try {
      const { name, provider, model, apiKey, maxTokensPerMessage, maxTokensPerDay, temperature, topP, maxHistoryMessages } = req.body;
      if (!name || !provider || !model || !apiKey) {
        res.status(400).json({ error: 'name, provider, model, and apiKey are required' });
        return;
      }
      config.profiles[name] = {
        provider, model,
        apiKey: encrypt(apiKey, config.encryptionKey),
        maxTokensPerMessage: maxTokensPerMessage || 4096,
        maxTokensPerDay: maxTokensPerDay || 100000,
        temperature, topP, maxHistoryMessages,
      };
      saveConfig(config);
      res.status(201).json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.put('/api/profiles/:name', (req, res) => {
    const existing = config.profiles[req.params.name];
    if (!existing) { res.status(404).json({ error: 'Profile not found' }); return; }
    const { provider, model, apiKey, maxTokensPerMessage, maxTokensPerDay, temperature, topP, maxHistoryMessages } = req.body;
    if (provider) existing.provider = provider;
    if (model) existing.model = model;
    if (apiKey) existing.apiKey = encrypt(apiKey, config.encryptionKey);
    if (maxTokensPerMessage !== undefined) existing.maxTokensPerMessage = maxTokensPerMessage;
    if (maxTokensPerDay !== undefined) existing.maxTokensPerDay = maxTokensPerDay;
    if (temperature !== undefined) existing.temperature = temperature;
    if (topP !== undefined) existing.topP = topP;
    if (maxHistoryMessages !== undefined) existing.maxHistoryMessages = maxHistoryMessages;
    providers.invalidateModel(req.params.name);
    saveConfig(config);
    res.json({ ok: true });
  });

  app.delete('/api/profiles/:name', (req, res) => {
    if (!config.profiles[req.params.name]) { res.status(404).json({ error: 'Profile not found' }); return; }
    delete config.profiles[req.params.name];
    providers.invalidateModel(req.params.name);
    saveConfig(config);
    res.json({ ok: true });
  });

  // Facts
  app.get('/api/facts', (_req, res) => {
    res.json(facts.getAll());
  });

  app.put('/api/facts/:id', (req, res) => {
    const { content, category } = req.body;
    facts.update(req.params.id, content, category);
    res.json({ ok: true });
  });

  app.delete('/api/facts/:id', (req, res) => {
    facts.delete(req.params.id);
    res.json({ ok: true });
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

  app.patch('/api/cron/:name', async (req, res) => {
    try {
      await scheduler.toggleJob(req.params.name, req.body.enabled);
      res.json({ ok: true });
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
    app.get('/{*path}', (_req, res) => {
      res.sendFile(join(uiDistPath, 'index.html'));
    });
  }

  // Socket.IO
  createSocketServer(httpServer, config, bus, conversations, agent);

  // Start Telegram if configured
  if (config.telegram?.botToken) {
    try {
      const { TelegramChannel } = await import('@amightyclaw/telegram');
      const telegram = new TelegramChannel(config, bus, conversations);
      await telegram.start();
      console.log('  📱 Telegram bot connected');
    } catch (e) {
      console.log(`  ❌ Telegram — ${(e as Error).message}`);
    }
  }

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
