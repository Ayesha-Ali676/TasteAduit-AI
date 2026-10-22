/**
 * TasteAudit AI - Stage 5: AI Provider Abstraction Contracts
 */

export type AIProviderName = 'groq' | 'openrouter' | 'mock';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface AICompletionResult {
  success: boolean;
  content?: string;
  provider: AIProviderName;
  model: string;
  error?: string;
  statusCode?: number;
  latencyMs?: number;
}

export interface AIProvider {
  readonly name: AIProviderName;
  isConfigured(): boolean;
  generateCompletion(messages: ChatMessage[], options?: AICallOptions): Promise<AICompletionResult>;
}

export interface AIRepairCandidate {
  name: string;
  entityId: string;
  type: string;
  category: 'entity' | 'tag';
  affinityValue?: number;
  tags?: string[];
  relationship?: string;
}

export interface AIRepairPromptContext {
  originalItem: string;
  auditContext: {
    overallScore: number;
    decisionStatus: string;
    decisionLabel: string;
    decisionExplanation: string;
    failedDimensions: string[];
    dimensionSummaries: Record<string, { score: number; classification: string; reason: string }>;
  };
  userContext: {
    audience?: string;
    location?: string;
    constraints: string[];
  };
  verifiedCandidates: AIRepairCandidate[];
}
