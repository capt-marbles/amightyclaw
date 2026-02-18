import type { Message } from '@amightyclaw/core';
import { SoulService } from '@amightyclaw/soul';
import { FactStore, ConversationStore } from '@amightyclaw/memory';

export class ContextBuilder {
  private soul: SoulService;
  private facts: FactStore;
  private conversations: ConversationStore;

  constructor(soul: SoulService, facts: FactStore, conversations: ConversationStore) {
    this.soul = soul;
    this.facts = facts;
    this.conversations = conversations;
  }

  async build(
    conversationId: string,
    userMessage: string,
    historyLimit = 20,
    systemPromptOverride?: string
  ): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    // System prompt: optional override prepended to Soul.MD content
    let systemPrompt = '';
    if (systemPromptOverride) {
      systemPrompt = systemPromptOverride + '\n\n';
    }
    systemPrompt += this.soul.getContent();

    // Retrieve relevant facts
    const relevantFacts = this.facts.searchHybrid(userMessage, 5);
    if (relevantFacts.length > 0) {
      systemPrompt += '\n\n## Remembered Facts\n';
      for (const fact of relevantFacts) {
        systemPrompt += `- [${fact.category}] ${fact.content}\n`;
      }
    }

    messages.push({ role: 'system', content: systemPrompt });

    // Conversation history
    const history = this.conversations.getMessages(conversationId, historyLimit);
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }
}
