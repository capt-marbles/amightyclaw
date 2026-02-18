import { v4 as uuid } from 'uuid';
import type { AppConfig, BusMessage } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import { ProviderRegistry } from '@amightyclaw/providers';
import { ConversationStore, FactStore, UsageStore } from '@amightyclaw/memory';
import { SoulService } from '@amightyclaw/soul';
import { MessageBus } from './message-bus.js';
import { ContextBuilder } from './context-builder.js';
import { FactExtractor } from './fact-extractor.js';
import { ToolRegistry } from './tool-registry.js';
import { setToolContext } from './tools/index.js';

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
  private toolRegistry: ToolRegistry;

  // Pending confirmations for script execution
  private pendingConfirmations = new Map<string, { resolve: (approved: boolean) => void }>();

  constructor(
    config: AppConfig,
    bus: MessageBus,
    providers: ProviderRegistry,
    soul: SoulService,
    conversations: ConversationStore,
    facts: FactStore,
    usage: UsageStore,
    toolRegistry: ToolRegistry
  ) {
    this.config = config;
    this.bus = bus;
    this.providers = providers;
    this.conversations = conversations;
    this.facts = facts;
    this.usage = usage;
    this.toolRegistry = toolRegistry;
    this.contextBuilder = new ContextBuilder(soul, facts, conversations);
    this.factExtractor = new FactExtractor(providers, facts, Object.keys(config.profiles)[0]);
  }

  get tools(): ToolRegistry {
    return this.toolRegistry;
  }

  /** Resolve a pending command execution confirmation */
  confirmCommand(toolCallId: string, approved: boolean): void {
    const pending = this.pendingConfirmations.get(toolCallId);
    if (pending) {
      pending.resolve(approved);
      this.pendingConfirmations.delete(toolCallId);
    }
  }

  /** Create a confirmation handler for use in the runCommand tool */
  createConfirmationHandler(conversationId: string, channel: string) {
    return (toolCallId: string, command: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        this.pendingConfirmations.set(toolCallId, { resolve });
        this.bus.emit('tool:confirm-request', { conversationId, channel, toolCallId, command });

        // Auto-deny after timeout
        const timeout = this.config.maxExecutionTimeout || 30000;
        setTimeout(() => {
          if (this.pendingConfirmations.has(toolCallId)) {
            this.pendingConfirmations.delete(toolCallId);
            resolve(false);
          }
        }, timeout + 10000); // Give extra time beyond execution timeout
      });
    };
  }

  start(): void {
    this.bus.on('message', (msg: BusMessage) => {
      if (msg.role === 'user') {
        log.info({ conversationId: msg.conversationId, profile: msg.profile }, 'Processing user message');
        this.handleUserMessage(msg).catch((e) => {
          log.error({ error: (e as Error).message, stack: (e as Error).stack }, 'Unhandled error in agent loop');
          this.bus.publishStreamEnd(msg.conversationId, msg.channel);
          this.bus.publish({
            id: uuid(),
            conversationId: msg.conversationId,
            channel: msg.channel,
            role: 'assistant',
            content: `Error: ${(e as Error).message}`,
            profile: msg.profile,
            timestamp: Date.now(),
          });
        });
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

    // Set tool context for this message (used by runCommand for confirmation)
    setToolContext(msg.conversationId, msg.channel, msg.profile);

    // Store user message
    this.conversations.addMessage({
      conversationId: msg.conversationId,
      role: 'user',
      content: msg.content,
      profile: msg.profile,
    });

    // Build context with per-profile settings
    log.info({ conversationId: msg.conversationId }, 'Building context');
    const context = await this.contextBuilder.build(
      msg.conversationId,
      msg.content,
      profile.maxHistoryMessages ?? 20,
      profile.systemPromptOverride
    );
    log.info({ messageCount: context.length }, 'Context built, calling provider');

    // Gather tools
    const tools = this.toolRegistry.getAll();
    const hasTools = Object.keys(tools).length > 0;

    // Stream response
    let fullResponse = '';
    let completionTokens = 0;
    try {
      for await (const chunk of this.providers.streamChat(msg.profile, context, {
        tools: hasTools ? tools : undefined,
        temperature: profile.temperature,
        topP: profile.topP,
        maxSteps: 5,
      })) {
        switch (chunk.type) {
          case 'text':
            if (chunk.text) {
              fullResponse += chunk.text;
              this.bus.publishStream(msg.conversationId, msg.channel, chunk.text);
            }
            break;
          case 'tool-call':
            log.info({ toolName: chunk.toolName, toolCallId: chunk.toolCallId }, 'Tool call');
            this.bus.emit('tool:call', {
              conversationId: msg.conversationId,
              channel: msg.channel,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.args,
            });
            break;
          case 'tool-result':
            log.info({ toolName: chunk.toolName, toolCallId: chunk.toolCallId }, 'Tool result');
            this.bus.emit('tool:result', {
              conversationId: msg.conversationId,
              channel: msg.channel,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              result: chunk.result,
            });
            break;
          case 'done':
            log.info({ promptTokens: chunk.usage?.promptTokens, completionTokens: chunk.usage?.completionTokens }, 'Stream complete');
            completionTokens = chunk.usage?.completionTokens || 0;
            try {
              this.usage.record(msg.profile, chunk.usage?.promptTokens, chunk.usage?.completionTokens);
            } catch (ue) {
              log.warn({ error: (ue as Error).message }, 'Usage recording failed (non-fatal)');
            }
            break;
        }
      }
    } catch (e) {
      const errorMsg = `Error: ${(e as Error).message}`;
      log.error({ error: (e as Error).message, stack: (e as Error).stack }, 'Stream failed');
      fullResponse = errorMsg;
    }

    this.bus.publishStreamEnd(msg.conversationId, msg.channel);

    // Store assistant message with token count
    this.conversations.addMessage({
      conversationId: msg.conversationId,
      role: 'assistant',
      content: fullResponse,
      profile: msg.profile,
      tokenCount: completionTokens,
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

    // Auto-generate title after first exchange
    const msgCount = this.conversations.getMessages(msg.conversationId, 3).length;
    if (msgCount <= 2) {
      this.generateTitle(msg.conversationId, msg.content, fullResponse, msg.profile, msg.channel);
    }

    // Extract facts in background (don't await)
    this.factExtractor.extract(msg.content, fullResponse).catch(() => {});
  }

  private async generateTitle(
    convId: string, userMsg: string, assistantMsg: string, profile: string, channel: string
  ): Promise<void> {
    try {
      let title = '';
      for await (const chunk of this.providers.streamChat(profile, [
        { role: 'system', content: 'Generate a concise 3-6 word title for this conversation. Return ONLY the title, no quotes or punctuation.' },
        { role: 'user', content: `User: ${userMsg}\nAssistant: ${assistantMsg.slice(0, 300)}` },
      ], { maxTokens: 20 })) {
        if (chunk.type === 'text' && chunk.text) title += chunk.text;
      }
      title = title.trim().replace(/^["']|["']$/g, '').slice(0, 60);
      if (title) {
        this.conversations.updateTitle(convId, title);
        this.bus.emit('conversation:title-updated', { conversationId: convId, title, channel });
      }
    } catch (e) {
      log.debug({ error: (e as Error).message }, 'Title generation failed (non-critical)');
    }
  }
}
