import { v4 as uuid } from 'uuid';
import type { AppConfig, BusMessage } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import { ProviderRegistry } from '@amightyclaw/providers';
import { ConversationStore, FactStore, UsageStore } from '@amightyclaw/memory';
import { SoulService } from '@amightyclaw/soul';
import { MessageBus } from './message-bus.js';
import { ContextBuilder } from './context-builder.js';
import { FactExtractor } from './fact-extractor.js';

const log = getLogger('agent');

export class AgentLoop {
  private bus: MessageBus;
  private providers: ProviderRegistry;
  private conversations: ConversationStore;
  private facts: FactStore;
  private usage: UsageStore;
  private contextBuilder: ContextBuilder;
  private factExtractor: FactExtractor;
  private config: AppConfig;

  constructor(
    config: AppConfig,
    bus: MessageBus,
    providers: ProviderRegistry,
    soul: SoulService,
    conversations: ConversationStore,
    facts: FactStore,
    usage: UsageStore
  ) {
    this.config = config;
    this.bus = bus;
    this.providers = providers;
    this.conversations = conversations;
    this.facts = facts;
    this.usage = usage;
    this.contextBuilder = new ContextBuilder(soul, facts, conversations);
    this.factExtractor = new FactExtractor(providers, facts, Object.keys(config.profiles)[0]);
  }

  start(): void {
    this.bus.on('message', async (msg: BusMessage) => {
      if (msg.role === 'user') {
        await this.handleUserMessage(msg);
      }
    });
    log.info('Agent loop started');
  }

  private async handleUserMessage(msg: BusMessage): Promise<void> {
    const profile = this.config.profiles[msg.profile];
    if (!profile) {
      this.bus.publish({
        id: uuid(),
        conversationId: msg.conversationId,
        channel: msg.channel,
        role: 'assistant',
        content: `Error: Profile "${msg.profile}" not found.`,
        profile: msg.profile,
        timestamp: Date.now(),
      });
      return;
    }

    // Check usage limits
    const usageCheck = this.usage.checkLimit(msg.profile, profile.maxTokensPerDay);
    if (!usageCheck.allowed) {
      this.bus.publish({
        id: uuid(),
        conversationId: msg.conversationId,
        channel: msg.channel,
        role: 'assistant',
        content: `Daily token limit reached for profile "${msg.profile}". Used: ${usageCheck.used}, Limit: ${profile.maxTokensPerDay}.`,
        profile: msg.profile,
        timestamp: Date.now(),
      });
      return;
    }

    // Store user message
    this.conversations.addMessage({
      conversationId: msg.conversationId,
      role: 'user',
      content: msg.content,
      profile: msg.profile,
    });

    // Build context
    const context = await this.contextBuilder.build(msg.conversationId, msg.content);

    // Stream response
    let fullResponse = '';
    try {
      for await (const chunk of this.providers.streamChat(msg.profile, context)) {
        if (chunk.type === 'text' && chunk.text) {
          fullResponse += chunk.text;
          this.bus.publishStream(msg.conversationId, msg.channel, chunk.text);
        }
        if (chunk.type === 'done' && chunk.usage) {
          this.usage.record(msg.profile, chunk.usage.promptTokens, chunk.usage.completionTokens);
        }
      }
    } catch (e) {
      const errorMsg = `Error: ${(e as Error).message}`;
      log.error({ error: (e as Error).message }, 'Stream failed');
      fullResponse = errorMsg;
    }

    this.bus.publishStreamEnd(msg.conversationId, msg.channel);

    // Store assistant message
    this.conversations.addMessage({
      conversationId: msg.conversationId,
      role: 'assistant',
      content: fullResponse,
      profile: msg.profile,
    });

    // Publish complete message
    this.bus.publish({
      id: uuid(),
      conversationId: msg.conversationId,
      channel: msg.channel,
      role: 'assistant',
      content: fullResponse,
      profile: msg.profile,
      timestamp: Date.now(),
    });

    // Extract facts in background (don't await)
    this.factExtractor.extract(msg.content, fullResponse).catch(() => {});
  }
}
