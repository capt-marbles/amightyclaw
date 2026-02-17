import { ProviderRegistry } from '@amightyclaw/providers';
import { FactStore } from '@amightyclaw/memory';
import { getLogger } from '@amightyclaw/core';

const log = getLogger('fact-extractor');

const EXTRACT_PROMPT = `You are a fact extraction system. Given a conversation exchange, extract any durable facts worth remembering about the user. These include:
- Personal preferences (favorite color, food, etc.)
- Biographical info (name, location, job, etc.)
- Project details they mention
- Explicit instructions ("always do X", "never do Y")

Return a JSON array of objects with "content" and "category" fields.
Categories: preference, biographical, project, instruction, general

If no facts are worth extracting, return an empty array: []

ONLY return valid JSON, nothing else.`;

export class FactExtractor {
  private providers: ProviderRegistry;
  private facts: FactStore;
  private extractionProfile: string;

  constructor(providers: ProviderRegistry, facts: FactStore, extractionProfile = 'free') {
    this.providers = providers;
    this.facts = facts;
    this.extractionProfile = extractionProfile;
  }

  async extract(userMessage: string, assistantResponse: string): Promise<void> {
    try {
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: EXTRACT_PROMPT },
        {
          role: 'user',
          content: `User said: "${userMessage}"\n\nAssistant responded: "${assistantResponse.slice(0, 500)}"`,
        },
      ];

      let fullText = '';
      for await (const chunk of this.providers.streamChat(this.extractionProfile, messages, 500)) {
        if (chunk.type === 'text' && chunk.text) {
          fullText += chunk.text;
        }
      }

      const parsed = JSON.parse(fullText.trim());
      if (Array.isArray(parsed)) {
        for (const fact of parsed) {
          if (fact.content && typeof fact.content === 'string') {
            this.facts.add(fact.content, fact.category || 'general', 'auto-extracted');
            log.info({ content: fact.content, category: fact.category }, 'Fact extracted');
          }
        }
      }
    } catch (e) {
      log.debug({ error: (e as Error).message }, 'Fact extraction failed (non-critical)');
    }
  }
}
