import { AIProvider, ChatMessage, AICallOptions, AICompletionResult } from './ai.types.js';
import { GroqProvider } from './groq.provider.js';
import { OpenRouterProvider } from './openrouter.provider.js';
import { logger } from '../../utils/logger.js';

export interface AIOrchestratorOptions {
  primaryProvider?: AIProvider;
  fallbackProvider?: AIProvider;
}

export class AIOrchestratorProvider {
  private readonly primary: AIProvider;
  private readonly fallback: AIProvider;

  constructor(options?: AIOrchestratorOptions) {
    this.primary = options?.primaryProvider ?? new GroqProvider();
    this.fallback = options?.fallbackProvider ?? new OpenRouterProvider();
  }

  public isAnyConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  /**
   * Executes completion attempting primary provider (Groq) first,
   * cleanly falling back to secondary provider (OpenRouter) on provider failures.
   */
  public async executeCompletion(
    messages: ChatMessage[],
    options?: AICallOptions
  ): Promise<AICompletionResult> {
    // 1. Try Primary Provider (Groq) if configured
    if (this.primary.isConfigured()) {
      logger.info(`[AI] Dispatching request to primary provider (${this.primary.name})...`);
      const primaryResult = await this.primary.generateCompletion(messages, options);

      if (primaryResult.success && primaryResult.content) {
        return primaryResult;
      }

      logger.warn(
        `[AI] Primary provider (${this.primary.name}) failed: ${primaryResult.error}. Evaluating fallback...`
      );
    } else {
      logger.info(`[AI] Primary provider (${this.primary.name}) not configured. Checking fallback...`);
    }

    // 2. Try Fallback Provider (OpenRouter) if configured
    if (this.fallback.isConfigured()) {
      logger.info(`[AI] Activating fallback provider (${this.fallback.name})...`);
      const fallbackResult = await this.fallback.generateCompletion(messages, options);

      if (fallbackResult.success && fallbackResult.content) {
        return fallbackResult;
      }

      logger.warn(`[AI] Fallback provider (${this.fallback.name}) failed: ${fallbackResult.error}`);
    } else {
      logger.warn(`[AI] Fallback provider (${this.fallback.name}) is not configured.`);
    }

    // 3. Both providers failed or neither is configured
    return {
      success: false,
      provider: 'groq',
      model: 'none',
      error: 'AI_REPAIR_UNAVAILABLE: All AI providers failed or are unconfigured.'
    };
  }
}

export const aiProvider = new AIOrchestratorProvider();
