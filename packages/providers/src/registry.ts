import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { streamText, generateText } from 'ai';
import type { CoreTool, LanguageModelV1 } from 'ai';
import type { ProviderType, AppConfig } from '@amightyclaw/core';
import { decrypt, getLogger } from '@amightyclaw/core';

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: string }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } };

export interface StreamOptions {
  maxTokens?: number;
  tools?: Record<string, CoreTool>;
  temperature?: number;
  topP?: number;
  maxSteps?: number;
}

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

  async validateProfile(profileName: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const model = this.getModel(profileName);
      const result = await generateText({
        model,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
        maxTokens: 10,
      });
      if (result.text) {
        log.info({ profile: profileName }, 'Profile validated successfully');
        return { valid: true };
      }
      return { valid: false, error: 'Empty response from model' };
    } catch (e) {
      const error = (e as Error).message;
      log.error({ profile: profileName, error }, 'Profile validation failed');
      return { valid: false, error };
    }
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

  invalidateModel(profileName: string): void {
    this.models.delete(profileName);
  }

  async *streamChat(
    profileName: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk> {
    const model = this.getModel(profileName);
    const profile = this.config.profiles[profileName];

    const hasTools = options?.tools && Object.keys(options.tools).length > 0;

    // Collect tool results from step callbacks (fullStream doesn't emit them directly)
    const toolResults: StreamChunk[] = [];

    const result = streamText({
      model,
      messages,
      maxTokens: options?.maxTokens || profile?.maxTokensPerMessage || 4096,
      ...(hasTools ? { tools: options!.tools, maxSteps: options?.maxSteps ?? 5 } : {}),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.topP !== undefined ? { topP: options.topP } : {}),
      onStepFinish: (step) => {
        const results = step.toolResults as Array<{ toolCallId: string; toolName: string; result: unknown }> | undefined;
        if (results) {
          for (const tr of results) {
            toolResults.push({
              type: 'tool-result',
              toolCallId: tr.toolCallId,
              toolName: tr.toolName,
              result: String(tr.result),
            });
          }
        }
      },
    });

    let lastResultIndex = 0;

    for await (const part of result.fullStream) {
      // Flush any tool results collected since last iteration
      while (lastResultIndex < toolResults.length) {
        yield toolResults[lastResultIndex++];
      }

      switch (part.type) {
        case 'text-delta':
          yield { type: 'text', text: part.textDelta };
          break;
        case 'tool-call':
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args as Record<string, unknown>,
          };
          break;
      }
    }

    // Flush remaining tool results
    while (lastResultIndex < toolResults.length) {
      yield toolResults[lastResultIndex++];
    }

    const usage = await result.usage;
    yield {
      type: 'done',
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    };
  }
}
