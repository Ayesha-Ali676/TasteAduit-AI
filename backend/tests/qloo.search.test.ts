import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ServerQlooClient,
  QlooConfigurationError,
  QlooAuthenticationError,
  QlooTimeoutError,
  QlooRateLimitError,
  QlooApiError
} from '../src/services/qloo/qloo.client.js';
import { CandidateNormalizer } from '../src/services/qloo/normalization.js';
import { QlooRawEntity, QlooRawTag } from '../src/services/qloo/qloo.types.js';

describe('ServerQlooClient & Normalization (Mocked Boundary)', () => {
  const secretKey = 'mock-secret-key-12345';
  let client: ServerQlooClient;

  beforeEach(() => {
    client = new ServerQlooClient({
      baseUrl: 'https://hackathon.api.qloo.com',
      apiKey: secretKey,
      timeoutMs: 100,
      maxRetries: 1
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty array for empty or whitespace query without network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const entities = await client.searchEntities('   ');
    const tags = await client.searchTags('');
    const candidates = await client.searchCandidates('');

    expect(entities).toEqual([]);
    expect(tags).toEqual([]);
    expect(candidates).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should throw QlooConfigurationError if API key is missing', async () => {
    const unconfiguredClient = new ServerQlooClient({ apiKey: undefined });
    await expect(unconfiguredClient.searchEntities('jazz')).rejects.toThrow(QlooConfigurationError);
    await expect(unconfiguredClient.searchTags('jazz')).rejects.toThrow(QlooConfigurationError);
  });

  it('should perform valid entity search and parse results', async () => {
    const mockEntities: QlooRawEntity[] = [
      {
        entity_id: 'ent_123',
        name: 'Miles Davis',
        types: ['urn:entity:artist'],
        popularity: 0.95,
        tags: [{ name: 'Bebop', tag_id: 't_1', type: 'genre', value: 'bebop' }]
      }
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEntities
    } as Response);

    const results = await client.searchEntities('Miles Davis');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Miles Davis');
    expect(results[0].entity_id).toBe('ent_123');
  });

  it('should handle invalid Qloo credentials (401/403) and not expose the secret key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    } as Response);

    try {
      await client.searchEntities('Miles Davis');
      expect.fail('Should have thrown QlooAuthenticationError');
    } catch (err) {
      expect(err).toBeInstanceOf(QlooAuthenticationError);
      const errString = String(err) + (err instanceof Error ? err.message : '');
      expect(errString).not.toContain(secretKey);
    }
  });

  it('should handle rate limits (429) cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too Many Requests' })
    } as Response);

    await expect(client.searchEntities('Miles Davis')).rejects.toThrow(QlooRateLimitError);
  });

  it('should handle timeouts and abort signal properly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    await expect(client.searchEntities('slow query')).rejects.toThrow(QlooTimeoutError);
  });

  it('should retry transient 5xx errors boundedly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service Unavailable' })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
      } as Response);

    const results = await client.searchEntities('query');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(results).toEqual([]);
  });

  it('should handle empty search results gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => []
    } as Response);

    const results = await client.searchEntities('nonexistent entity xyz123');
    expect(results).toEqual([]);
  });

  it('should accurately normalize raw entities and tags into NormalizedCandidate contract', () => {
    const rawEntity: QlooRawEntity = {
      entity_id: 'ent_999',
      name: 'Blue Note Records',
      types: ['urn:entity:brand'],
      popularity: 0.88,
      disambiguation: 'Record Label',
      tags: [{ name: 'Jazz', tag_id: 't_jazz', type: 'genre', value: 'jazz' }]
    };

    const normalizedEntity = CandidateNormalizer.normalizeEntity(rawEntity);
    expect(normalizedEntity.id).toBe('ent_999');
    expect(normalizedEntity.name).toBe('Blue Note Records');
    expect(normalizedEntity.type).toBe('urn:entity:brand');
    expect(normalizedEntity.category).toBe('entity');
    expect(normalizedEntity.popularity).toBe(0.88);
    expect(normalizedEntity.tags).toEqual(['Jazz']);
    expect(normalizedEntity.source).toBe('qloo');

    const rawTag: QlooRawTag = {
      id: 'urn:tag:genre:music:jazz',
      name: 'Jazz',
      type: 'urn:tag:genre:music',
      popularity: 0.99,
      parents: [{ type: 'urn:entity:artist' }]
    };

    const normalizedTag = CandidateNormalizer.normalizeTag(rawTag);
    expect(normalizedTag.id).toBe('urn:tag:genre:music:jazz');
    expect(normalizedTag.name).toBe('Jazz');
    expect(normalizedTag.type).toBe('urn:tag:genre:music');
    expect(normalizedTag.category).toBe('tag');
    expect(normalizedTag.tags).toEqual(['urn:entity:artist']);
  });

  it('should deduplicate candidates by id', () => {
    const rawEntity: QlooRawEntity = {
      entity_id: 'ent_1',
      name: 'Item',
      types: ['urn:entity:place']
    };
    const c1 = CandidateNormalizer.normalizeEntity(rawEntity);
    const c2 = CandidateNormalizer.normalizeEntity(rawEntity);

    const deduped = CandidateNormalizer.deduplicate([c1, c2]);
    expect(deduped).toHaveLength(1);
  });

  it('should map properties.image.url to imageUrl when present on raw entity and tag', () => {
    const rawEntityWithImage: QlooRawEntity = {
      entity_id: 'ent_movie_pulp',
      name: 'Pulp Fiction',
      types: ['urn:entity:movie'],
      properties: {
        image: {
          url: 'https://images.qloo.com/i/ent_movie_pulp-420x-auto.jpg'
        }
      }
    };

    const normalized = CandidateNormalizer.normalizeEntity(rawEntityWithImage);
    expect(normalized.imageUrl).toBe('https://images.qloo.com/i/ent_movie_pulp-420x-auto.jpg');

    const rawTagWithImage: QlooRawTag = {
      id: 'tag_1',
      name: 'Indie Rock',
      type: 'genre',
      properties: {
        image: {
          url: 'https://images.qloo.com/i/tag_1-420x-auto.jpg'
        }
      }
    };

    const normalizedTag = CandidateNormalizer.normalizeTag(rawTagWithImage);
    expect(normalizedTag.imageUrl).toBe('https://images.qloo.com/i/tag_1-420x-auto.jpg');
  });

  it('should leave imageUrl undefined when properties or image.url is missing', () => {
    const rawEntityNoImage: QlooRawEntity = {
      entity_id: 'ent_plain',
      name: 'Plain Entity',
      types: ['urn:entity:place']
    };

    const normalized = CandidateNormalizer.normalizeEntity(rawEntityNoImage);
    expect(normalized.imageUrl).toBeUndefined();
  });
});
