import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AppConfig } from './types.js';

const ProfileSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'mistral', 'ollama']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  maxTokensPerMessage: z.number().int().positive().default(4096),
  maxTokensPerDay: z.number().int().positive().default(100000),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  systemPromptOverride: z.string().optional(),
  maxHistoryMessages: z.number().int().positive().optional(),
});

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3333),
  host: z.string().default('127.0.0.1'),
  password: z.string().min(1),
  jwtSecret: z.string().min(32),
  encryptionKey: z.string().min(32),
  profiles: z.record(z.string(), ProfileSchema).refine(
    (p) => Object.keys(p).length > 0,
    { message: 'At least one profile is required' }
  ),
  dataDir: z.string().default(''),
  logLevel: z.string().default('info'),
  braveApiKey: z.string().optional(),
  maxExecutionTimeout: z.number().int().positive().default(30000),
  commandDenyList: z.array(z.string()).optional(),
  telegram: z.object({ botToken: z.string().min(1) }).optional(),
});

export function getDataDir(): string {
  return join(homedir(), '.amightyclaw');
}

export function ensureDataDir(): string {
  const dataDir = getDataDir();
  const dirs = [dataDir, join(dataDir, 'data'), join(dataDir, 'logs')];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  return dataDir;
}

export function loadConfig(): AppConfig {
  const dataDir = getDataDir();
  const configPath = join(dataDir, 'config.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `Config not found at ${configPath}. Run "amightyclaw setup" first.`
    );
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  const parsed = ConfigSchema.parse(raw);

  return {
    ...parsed,
    dataDir: parsed.dataDir || dataDir,
  };
}

export function saveConfig(config: Partial<AppConfig>): void {
  const dataDir = ensureDataDir();
  const configPath = join(dataDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function configExists(): boolean {
  return existsSync(join(getDataDir(), 'config.json'));
}

export { ConfigSchema, ProfileSchema };
