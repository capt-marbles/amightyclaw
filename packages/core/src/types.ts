export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  profile: string;
  tokenCount?: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Fact {
  id: string;
  content: string;
  category: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileConfig {
  provider: ProviderType;
  model: string;
  apiKey: string;
  maxTokensPerMessage: number;
  maxTokensPerDay: number;
  temperature?: number;
  topP?: number;
  systemPromptOverride?: string;
  maxHistoryMessages?: number;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'mistral' | 'ollama';

export interface AppConfig {
  port: number;
  host: string;
  password: string;
  jwtSecret: string;
  encryptionKey: string;
  profiles: Record<string, ProfileConfig>;
  dataDir: string;
  logLevel: string;
  braveApiKey?: string;
  maxExecutionTimeout?: number;
  commandDenyList?: string[];
  telegram?: { botToken: string };
  phantomBuster?: {
    apiKey: string;
    tweetExtractorAgentId?: string;
    searchExportAgentId?: string;
  };
}

export interface UsageRecord {
  profile: string;
  date: string;
  tokensUsed: number;
}

export interface CronJob {
  id: string;
  name: string;
  cron: string;
  message: string;
  profile: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface Channel {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(conversationId: string, content: string): Promise<void>;
  isRunning(): boolean;
}

export interface BusMessage {
  id: string;
  conversationId: string;
  channel: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  profile: string;
  timestamp: number;
}
