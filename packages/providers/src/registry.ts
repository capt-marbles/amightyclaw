import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import type { ProviderType, ProfileConfig, AppConfig } from '@amightyclaw/core';
import { decrypt, getLogger } from '@amightyclaw/core';
import type { LanguageModelV1 } from 'ai';

const log = getLogger('providers');

export class ProviderRegistry {
  private models = new Map<string, LanguageModelV1>();
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  getModel(profileName: string): LanguageModelV1 {
    if (this.models.has(profileName)) {
      return this.models.get(profileName)!;
    }

    const profile = this.config.profiles[profileName];
    if (!profile) {
      throw new Error(`Profile "${profileName}" not found`);
    }

    const apiKey = decrypt(profile.apiKey, this.config.encryptionKey);
    const model = this.createModel(profile.provider, profile.model, apiKey);
    this.models.set(profileName, model);
    log.info({ profile: profileName, provider: profile.provider, model: profile.model }, 'Provider initialized');
    return model;
  }

  private createModel(provider: ProviderType, model: string, apiKey: string): LanguageModelV1 {
    switch (provider) {
      case 'openai': {
        const openai = createOpenAI({ apiKey });
        return openai(model);
      }
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey });
        return anthropic(model);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({ apiKey });
        return google(model);
      }
      case 'mistral': {
        const mistral = createMistral({ apiKey });
        return mistral(model);
      }
      case 'ollama': {
        // Ollama uses OpenAI-compatible API
        const ollama = createOpenAI({
          apiKey: 'ollama',
          baseURL: apiKey || 'http://localhost:11434/v1',
        });
        return ollama(model);
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async *streamChat(
    profileName: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    maxTokens?: number
  ): AsyncGenerator<{ type: 'text' | 'done'; text?: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const model = this.getModel(profileName);
    const profile = this.config.profiles[profileName];

    const result = streamText({
      model,
      messages,
      maxTokens: maxTokens || profile?.maxTokensPerMessage || 4096,
    });

    for await (const chunk of (await result).textStream) {
      yield { type: 'text', text: chunk };
    }

    const finalResult = await result;
    const usage = await finalResult.usage;

    yield {
      type: 'done',
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    };
  }
}

