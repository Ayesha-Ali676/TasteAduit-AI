import { AIProvider, ChatMessage, AICallOptions, AICompletionResult } from './ai.types.js';
import { config, AIProviderConfig } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

export class OpenRouterProvider implements AIProvider {
  public readonly name = 'openrouter' as const;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(customConfig?: Partial<AIProviderConfig> & { endpoint?: string }) {
    this.apiKey = customConfig?.apiKey ?? config.ai.openRouter.apiKey;
    this.model = customConfig?.model ?? config.ai.openRouter.model;
    this.timeoutMs = customConfig?.timeoutMs ?? config.ai.openRouter.timeoutMs;
    this.endpoint = customConfig?.endpoint ?? 'https://openrouter.ai/api/v1/chat/completions';
  }

  public isConfigured(): boolean {
    return !!(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async generateCompletion(
    messages: ChatMessage[],
    options?: AICallOptions
  ): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: 'openrouter',
        model: this.model,
        error: 'OpenRouter provider is not configured: OPENROUTER_API_KEY is missing.'
      };
    }

    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const start = Date.now();

    try {
      logger.info(`[OpenRouter] Requesting completion with model ${this.model} (timeout: ${timeout}ms)...`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://tasteaudit.ai',
          'X-Title': 'TasteAudit AI'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 768,
          ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const isPaymentRequired = response.status === 402;
        const isRateLimit = response.status === 429;
        let reasonDesc = `OpenRouter API responded with HTTP ${response.status}`;
        if (isPaymentRequired) {
          reasonDesc = 'OpenRouter insufficient credits (HTTP 402)';
        } else if (isRateLimit) {
          reasonDesc = 'OpenRouter rate limit exceeded (HTTP 429)';
        }
        logger.warn(`[OpenRouter] API request failed with status ${response.status}: ${errorText.slice(0, 200)}`);
        return {
          success: false,
          provider: 'openrouter',
          model: this.model,
          statusCode: response.status,
          error: reasonDesc,
          latencyMs
        };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return {
          success: false,
          provider: 'openrouter',
          model: this.model,
          error: 'OpenRouter returned an empty response body.',
          latencyMs
        };
      }

      logger.info(`[OpenRouter] Completion successful (${latencyMs}ms).`);
      return {
        success: true,
        content,
        provider: 'openrouter',
        model: this.model,
        latencyMs
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        (err as { name?: string })?.name === 'AbortError' ||
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('aborted');

      logger.warn(`[OpenRouter] Request error: ${isTimeout ? 'Request timed out' : errorMsg}`);

      return {
        success: false,
        provider: 'openrouter',
        model: this.model,
        error: isTimeout ? `OpenRouter request timed out after ${timeout}ms` : errorMsg,
        latencyMs
      };
    }
  }
}
