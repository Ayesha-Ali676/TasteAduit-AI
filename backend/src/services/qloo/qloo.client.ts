import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import {
  QlooClient,
  QlooClientConfig,
  QlooRawEntity,
  QlooRawTag,
  QlooRawInsightItem,
  NormalizedCandidate
} from './qloo.types.js';
import { CandidateNormalizer } from './normalization.js';

export class QlooConfigurationError extends Error {
  constructor(message = 'Qloo API credentials are missing or unconfigured.') {
    super(message);
    this.name = 'QlooConfigurationError';
  }
}

export class QlooAuthenticationError extends Error {
  constructor(message = 'Invalid Qloo API credentials provided to Qloo Hackathon API.') {
    super(message);
    this.name = 'QlooAuthenticationError';
  }
}

export class QlooRateLimitError extends Error {
  constructor(message = 'Qloo Hackathon API rate limit exceeded.') {
    super(message);
    this.name = 'QlooRateLimitError';
  }
}

export class QlooTimeoutError extends Error {
  constructor(message = 'Qloo API request timed out.') {
    super(message);
    this.name = 'QlooTimeoutError';
  }
}

export class QlooApiError extends Error {
  public statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'QlooApiError';
    this.statusCode = statusCode;
  }
}

export class ServerQlooClient implements QlooClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(customConfig?: Partial<QlooClientConfig>) {
    this.baseUrl = customConfig?.baseUrl || config.qloo.baseUrl;
    // Strictly respect explicitly passed apiKey (even if undefined or empty)
    this.apiKey = customConfig && Object.prototype.hasOwnProperty.call(customConfig, 'apiKey')
      ? customConfig.apiKey
      : config.qloo.apiKey;
    this.timeoutMs = customConfig?.timeoutMs || 8000;
    this.maxRetries = customConfig?.maxRetries ?? 1;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  public assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new QlooConfigurationError(
        'Qloo API Key is not configured. Please set QLOO_API_KEY in server environment.'
      );
    }
  }

  /**
   * Safe fetch execution with timeout, authentication headers, and bounded transient retry.
   */
  private async safeRequest<T>(endpointPath: string, queryParams: Record<string, string | number | boolean | undefined>): Promise<T> {
    this.assertConfigured();

    const url = new URL(endpointPath, this.baseUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        url.searchParams.append(key, String(value));
      }
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': this.apiKey!,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as T;
          return data;
        }

        // Handle specific HTTP error status codes safely
        if (response.status === 401 || response.status === 403) {
          throw new QlooAuthenticationError(`Qloo API authentication failed with status ${response.status}.`);
        }

        if (response.status === 429) {
          throw new QlooRateLimitError('Qloo API rate limit reached. Please back off.');
        }

        // For transient 5xx errors, retry if attempts remain
        if (response.status >= 500 && attempt <= this.maxRetries) {
          logger.warn(`Transient Qloo API error ${response.status}. Retrying attempt ${attempt}...`);
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }

        throw new QlooApiError(`Qloo API request failed with status ${response.status}`, response.status);
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof QlooAuthenticationError || err instanceof QlooRateLimitError || err instanceof QlooApiError) {
          throw err;
        }

        if (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))) {
          if (attempt <= this.maxRetries) {
            logger.warn(`Qloo API request timeout on attempt ${attempt}. Retrying...`);
            continue;
          }
          throw new QlooTimeoutError(`Qloo API request timed out after ${this.timeoutMs}ms.`);
        }

        // Network or fetch connection failure
        if (attempt <= this.maxRetries) {
          logger.warn(`Network error during Qloo request. Retrying attempt ${attempt}...`);
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }

        const scrubbedMessage = err instanceof Error ? err.message : 'Unknown network failure';
        throw new QlooApiError(`Failed to communicate with Qloo API: ${scrubbedMessage}`);
      }
    }

    throw new QlooApiError('Failed to execute request after retries.');
  }

  /**
   * Search for entities by name (GET /search)
   */
  public async searchEntities(
    query: string,
    options?: { type?: string; take?: number }
  ): Promise<QlooRawEntity[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const raw = await this.safeRequest<QlooRawEntity[] | { results?: QlooRawEntity[] }>('/search', {
      query: query.trim(),
      take: options?.take || 10,
      types: options?.type
    });

    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && Array.isArray(raw.results)) {
      return raw.results;
    }
    return [];
  }

  /**
   * Search for tags by query (GET /v2/tags)
   */
  public async searchTags(
    query: string,
    options?: { type?: string; take?: number }
  ): Promise<QlooRawTag[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const raw = await this.safeRequest<QlooRawTag[] | { results?: QlooRawTag[]; tags?: QlooRawTag[] }>('/v2/tags', {
      'filter.query': query.trim(),
      'feature.semantic_search': true,
      take: options?.take || 10,
      type: options?.type
    });

    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && Array.isArray(raw.results)) {
      return raw.results;
    }
    if (raw && Array.isArray(raw.tags)) {
      return raw.tags;
    }
    return [];
  }

  /**
   * Executes candidate search across entities and tags, returning normalized candidates.
   */
  public async searchCandidates(
    query: string,
    options?: { type?: string; take?: number }
  ): Promise<NormalizedCandidate[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    const timestamp = new Date().toISOString();
    const take = options?.take || 10;

    // Run entity search and tag search in parallel with error tolerance
    const [entitiesResult, tagsResult] = await Promise.allSettled([
      this.searchEntities(query, { type: options?.type, take }),
      this.searchTags(query, { type: options?.type, take })
    ]);

    const candidates: NormalizedCandidate[] = [];

    if (entitiesResult.status === 'fulfilled') {
      for (const entity of entitiesResult.value) {
        candidates.push(CandidateNormalizer.normalizeEntity(entity, timestamp));
      }
    } else {
      logger.warn('Entity search failed in candidate search:', entitiesResult.reason?.message);
    }

    if (tagsResult.status === 'fulfilled') {
      for (const tag of tagsResult.value) {
        candidates.push(CandidateNormalizer.normalizeTag(tag, timestamp));
      }
    } else {
      logger.warn('Tag search failed in candidate search:', tagsResult.reason?.message);
    }

    // If both failed and threw an error, rethrow
    if (entitiesResult.status === 'rejected' && tagsResult.status === 'rejected') {
      throw entitiesResult.reason;
    }

    return CandidateNormalizer.deduplicate(candidates);
  }

  /**
   * Retrieves taste-based insights and affinities (GET /v2/insights)
   */
  public async getInsights(params: {
    signalEntityId?: string;
    signalTagId?: string;
    targetType?: string;
    location?: string;
    take?: number;
  }): Promise<QlooRawInsightItem[]> {
    const isWkt = params.location && /^(POINT|POLYGON|LINESTRING|GEOMETRYCOLLECTION)\s*\(/i.test(params.location.trim());

    const raw = await this.safeRequest<
      | QlooRawInsightItem[]
      | { results?: QlooRawInsightItem[] | { entities?: QlooRawInsightItem[] }; insights?: QlooRawInsightItem[] }
    >(
      '/v2/insights',
      {
        'signal.interests.entities': params.signalEntityId,
        'signal.interests.tags': params.signalTagId,
        'filter.type': params.targetType || 'urn:entity:artist',
        'filter.location': isWkt ? params.location : undefined,
        take: params.take || 5
      }
    );

    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && typeof raw === 'object' && 'results' in raw && raw.results) {
      if (Array.isArray(raw.results)) {
        return raw.results;
      }
      if (typeof raw.results === 'object' && 'entities' in raw.results && Array.isArray(raw.results.entities)) {
        return raw.results.entities;
      }
    }
    if (raw && typeof raw === 'object' && 'insights' in raw && Array.isArray(raw.insights)) {
      return raw.insights;
    }
    return [];
  }

  /**
   * Retrieves detailed attributes and cultural tags for a specific entity (GET /entities)
   */
  public async getEntityDetails(entityId: string): Promise<QlooRawEntity | null> {
    if (!entityId || entityId.trim() === '') {
      return null;
    }

    const raw = await this.safeRequest<QlooRawEntity[] | { results?: QlooRawEntity[] }>('/entities', {
      entity_ids: entityId.trim()
    });

    if (Array.isArray(raw) && raw.length > 0) {
      return raw[0];
    }
    if (raw && 'results' in raw && Array.isArray(raw.results) && raw.results.length > 0) {
      return raw.results[0];
    }
    return null;
  }
}

export const qlooClient = new ServerQlooClient();
