import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { BoundedMemoryCache } from '../src/services/evidence/evidence.cache.js';
import {
  ServerQlooClient,
  QlooConfigurationError,
  QlooAuthenticationError,
  QlooTimeoutError,
  QlooRateLimitError
} from '../src/services/qloo/qloo.client.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { QlooRawInsightItem, QlooRawEntity } from '../src/services/qloo/qloo.types.js';

describe('Stage 3: Evidence Retrieval Service & Normalization', () => {
  const secretKey = 'mock-super-secret-key-xyz987';
  let client: ServerQlooClient;
  let cache: BoundedMemoryCache<any>;
  let service: EvidenceRetrievalService;

  beforeEach(() => {
    client = new ServerQlooClient({
      baseUrl: 'https://hackathon.api.qloo.com',
      apiKey: secretKey,
      timeoutMs: 150,
      maxRetries: 1
    });
    cache = new BoundedMemoryCache(10, 500); // 10 items, 500ms TTL for testing
    service = new EvidenceRetrievalService(client, cache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully retrieve and normalize Qloo taste evidence', async () => {
    const mockInsights: QlooRawInsightItem[] = [
      {
        entity_id: 'ent_related_1',
        name: 'Reservoir Dogs',
        types: ['urn:entity:movie'],
        popularity: 0.92,
        query: {
          affinity: 0.945
        },
        tags: [
          { name: 'Crime Thriller', type: 'genre' },
          { name: 'Cult Classic', type: 'theme' }
        ]
      }
    ];

    const mockDetails: QlooRawEntity = {
      entity_id: 'ent_pulp_fiction',
      name: 'Pulp Fiction',
      types: ['urn:entity:movie'],
      popularity: 0.98,
      tags: [
        { name: 'Non-linear', type: 'style' }
      ]
    };

    vi.spyOn(client, 'getInsights').mockResolvedValueOnce(mockInsights);
    vi.spyOn(client, 'getEntityDetails').mockResolvedValueOnce(mockDetails);

    const result = await service.retrieveEvidence({
      entityId: 'ent_pulp_fiction',
      entityName: 'Pulp Fiction',
      entityType: 'urn:entity:movie',
      category: 'entity',
      audience: 'Film buffs',
      location: 'Los Angeles'
    });

    expect(result.status).toBe('supported');
    expect(result.entityId).toBe('ent_pulp_fiction');
    expect(result.entityName).toBe('Pulp Fiction');
    expect(result.signals.length).toBe(2); // 1 insight + 1 direct tag

    // Verify empirical affinity is preserved without fabrication
    const affinitySignal = result.signals.find((s) => s.signalType === 'taste_affinity');
    expect(affinitySignal).toBeDefined();
    expect(affinitySignal?.relatedEntityName).toBe('Reservoir Dogs');
    expect(affinitySignal?.value).toBe(0.945);
    expect(affinitySignal?.relationship).toBe('high_taste_affinity');

    // Verify direct cultural tag
    const tagSignal = result.signals.find((s) => s.signalType === 'cultural_tag');
    expect(tagSignal).toBeDefined();
    expect(tagSignal?.relatedEntityName).toBe('Non-linear');

    // Verify summary
    expect(result.summary.signalsCount).toBe(2);
    expect(result.summary.averageAffinity).toBe(0.945);
    expect(result.summary.topAffinitySignal).toBe('Reservoir Dogs');

    // Verify provenance
    expect(result.provenance.source).toBe('qloo');
    expect(result.provenance.classification).toBe('Supported');
    expect(result.provenance.correlationId).toBeDefined();
    expect(result.provenance.retrievedAt).toBeDefined();
    expect(result.provenance.queryMetadata.entityId).toBe('ent_pulp_fiction');
    expect(result.provenance.queryMetadata.userLocation).toBe('Los Angeles');
    expect(result.provenance.queryMetadata.locationFilterApplied).toBe(false);
  });

  it('should safely abstain when Qloo returns empty evidence (insufficient_evidence)', async () => {
    vi.spyOn(client, 'getInsights').mockResolvedValueOnce([]);
    vi.spyOn(client, 'getEntityDetails').mockResolvedValueOnce(null);

    const result = await service.retrieveEvidence({
      entityId: 'ent_rare_item',
      entityName: 'Obscure Film',
      entityType: 'urn:entity:movie'
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.signals).toEqual([]);
    expect(result.summary.signalsCount).toBe(0);
    expect(result.provenance.classification).toBe('Unverified');
  });

  it('should not fabricate affinity score if Qloo does not provide one', async () => {
    const mockInsightsNoAffinity: QlooRawInsightItem[] = [
      {
        entity_id: 'ent_related_no_score',
        name: 'Another Movie',
        types: ['urn:entity:movie']
        // Notice query.affinity is completely absent
      }
    ];

    vi.spyOn(client, 'getInsights').mockResolvedValueOnce(mockInsightsNoAffinity);
    vi.spyOn(client, 'getEntityDetails').mockResolvedValueOnce(null);

    const result = await service.retrieveEvidence({
      entityId: 'ent_some_item',
      entityName: 'Some Item',
      entityType: 'urn:entity:movie'
    });

    expect(result.status).toBe('supported');
    expect(result.signals[0].value).toBeUndefined(); // Crucial: NEVER fabricate a number
    expect(result.summary.averageAffinity).toBeUndefined();
  });

  it('should serve repeated requests from bounded process-local cache', async () => {
    const mockInsights: QlooRawInsightItem[] = [
      {
        entity_id: 'ent_cached',
        name: 'Cached Item',
        types: ['urn:entity:artist'],
        query: { affinity: 0.88 }
      }
    ];

    const getInsightsSpy = vi.spyOn(client, 'getInsights').mockResolvedValue(mockInsights);
    vi.spyOn(client, 'getEntityDetails').mockResolvedValue(null);

    const req = {
      entityId: 'ent_cache_test',
      entityName: 'Cache Test Artist',
      entityType: 'urn:entity:artist'
    };

    // First call: client invoked
    const res1 = await service.retrieveEvidence(req);
    expect(res1.status).toBe('supported');
    expect(getInsightsSpy).toHaveBeenCalledTimes(1);

    // Second call: served from cache
    const res2 = await service.retrieveEvidence(req);
    expect(res2.status).toBe('supported');
    expect(getInsightsSpy).toHaveBeenCalledTimes(1); // No new network call
  });

  it('should expire cache entries after TTL', async () => {
    const mockInsights: QlooRawInsightItem[] = [
      {
        entity_id: 'ent_ttl',
        name: 'TTL Item',
        types: ['urn:entity:artist']
      }
    ];

    // Short TTL cache (50ms)
    const shortTtlCache = new BoundedMemoryCache<any>(10, 50);
    const shortService = new EvidenceRetrievalService(client, shortTtlCache);

    const getInsightsSpy = vi.spyOn(client, 'getInsights').mockResolvedValue(mockInsights);
    vi.spyOn(client, 'getEntityDetails').mockResolvedValue(null);

    const req = {
      entityId: 'ent_ttl_test',
      entityName: 'TTL Test',
      entityType: 'urn:entity:artist'
    };

    await shortService.retrieveEvidence(req);
    expect(getInsightsSpy).toHaveBeenCalledTimes(1);

    // Wait 60ms for TTL expiration
    await new Promise((resolve) => setTimeout(resolve, 60));

    await shortService.retrieveEvidence(req);
    expect(getInsightsSpy).toHaveBeenCalledTimes(2);
  });

  it('should evict least-recently-used item when cache capacity is reached', () => {
    const tinyCache = new BoundedMemoryCache<string>(2, 10000);
    tinyCache.set('k1', 'val1');
    tinyCache.set('k2', 'val2');

    expect(tinyCache.get('k1')).toBe('val1');
    expect(tinyCache.get('k2')).toBe('val2');

    // Insert 3rd item, causing oldest/first to be evicted
    tinyCache.set('k3', 'val3');
    expect(tinyCache.get('k3')).toBe('val3');
    expect(tinyCache.size()).toBeLessThanOrEqual(2);
  });

  it('should not contain secrets in cache keys', () => {
    const key = BoundedMemoryCache.createKey('ent_123', 'urn:entity:movie', 'Paris');
    expect(key).not.toContain(secretKey);
    expect(key).toBe('ev_ent_123::urn:entity:movie::paris');
  });

  it('should handle missing credentials safely', async () => {
    const unconfiguredClient = new ServerQlooClient({ apiKey: undefined });
    await expect(unconfiguredClient.getInsights({ signalEntityId: 'ent_1' })).rejects.toThrow(QlooConfigurationError);
  });

  it('should handle invalid credentials (401) without leaking secret key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid API Key' })
    } as Response);

    try {
      await client.getInsights({ signalEntityId: 'ent_1' });
      expect.fail('Expected QlooAuthenticationError');
    } catch (err) {
      expect(err).toBeInstanceOf(QlooAuthenticationError);
      const str = String(err);
      expect(str).not.toContain(secretKey);
    }
  });

  it('should handle rate limiting (429) cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' })
    } as Response);

    await expect(client.getInsights({ signalEntityId: 'ent_1' })).rejects.toThrow(QlooRateLimitError);
  });

  it('should handle timeout cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    await expect(client.getInsights({ signalEntityId: 'ent_1' })).rejects.toThrow(QlooTimeoutError);
  });

  it('should retry transient 5xx errors boundedly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
      } as Response);

    const res = await client.getInsights({ signalEntityId: 'ent_1' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res).toEqual([]);
  });

  it('should handle malformed JSON safely without crashing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => 'not a valid object or array'
    } as any);

    const res = await client.getInsights({ signalEntityId: 'ent_1' });
    expect(res).toEqual([]);
  });
});

describe('TasteAuditOrchestrator Stage 3 Retrieval Execution Policy', () => {
  let mockResolutionService: EntityResolutionService;
  let mockEvidenceService: EvidenceRetrievalService;
  let orchestrator: TasteAuditOrchestrator;

  beforeEach(() => {
    mockResolutionService = new EntityResolutionService(new ServerQlooClient({ apiKey: 'mock' }));
    mockEvidenceService = new EvidenceRetrievalService(new ServerQlooClient({ apiKey: 'mock' }));
    orchestrator = new TasteAuditOrchestrator(mockResolutionService, mockEvidenceService);
  });

  it('should trigger retrieval ONLY for resolved entities, never for ambiguous or unresolved', async () => {
    // Item 1: Resolved
    vi.spyOn(mockResolutionService, 'resolve')
      .mockResolvedValueOnce({
        query: 'Pulp Fiction',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_pulp',
          name: 'Pulp Fiction',
          type: 'urn:entity:movie',
          category: 'entity',
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        },
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Supported',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c1',
          resolutionStatus: 'resolved'
        }
      })
      // Item 2: Ambiguous
      .mockResolvedValueOnce({
        query: 'Jazz',
        status: 'ambiguous',
        reason: 'Multiple plausible Qloo matches',
        candidates: [
          {
            id: 'tag_jazz',
            name: 'Jazz',
            type: 'urn:tag:genre:music',
            category: 'tag',
            source: 'qloo',
            retrievedAt: new Date().toISOString()
          },
          {
            id: 'ent_jazz',
            name: 'Jazz',
            type: 'urn:entity:album',
            category: 'entity',
            source: 'qloo',
            retrievedAt: new Date().toISOString()
          }
        ],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Inferred',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c2',
          resolutionStatus: 'ambiguous'
        }
      })
      // Item 3: Unresolved
      .mockResolvedValueOnce({
        query: 'Unknown Nonexistent Concept',
        status: 'unresolved',
        reason: 'Zero matching entities',
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Unverified',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c3',
          resolutionStatus: 'unresolved'
        }
      });

    const retrieveSpy = vi.spyOn(mockEvidenceService, 'retrieveEvidence').mockResolvedValueOnce({
      status: 'supported',
      entityId: 'ent_pulp',
      entityName: 'Pulp Fiction',
      entityType: 'urn:entity:movie',
      signals: [
        {
          signalType: 'taste_affinity',
          relatedEntityName: 'Reservoir Dogs',
          value: 0.945
        }
      ],
      summary: {
        signalsCount: 1,
        averageAffinity: 0.945,
        topAffinitySignal: 'Reservoir Dogs',
        hasLocationSignal: false
      },
      provenance: {
        source: 'qloo',
        endpoint: '/v2/insights, /entities',
        operation: 'retrieve_taste_evidence',
        correlationId: 'ev_1',
        retrievedAt: new Date().toISOString(),
        queryMetadata: {},
        classification: 'Supported'
      }
    });

    const result = await orchestrator.executePipeline({
      rawRecommendation: '1. Pulp Fiction\n2. Jazz\n3. Unknown Nonexistent Concept'
    });

    expect(result.stagesExecuted).toEqual(['PARSE', 'RESOLVE', 'RETRIEVE', 'AUDIT']);
    expect(result.items).toHaveLength(3);

    // Crucial check: retrieveEvidence should only have been called ONCE (for item 1)
    expect(retrieveSpy).toHaveBeenCalledTimes(1);
    expect(retrieveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'ent_pulp',
        entityName: 'Pulp Fiction'
      })
    );

    // Item 1 (Resolved) has supported evidence
    expect(result.items![0].evidence?.status).toBe('supported');
    expect(result.items![0].evidence?.signals).toHaveLength(1);

    // Item 2 (Ambiguous) has ambiguous evidence status and no signals
    expect(result.items![1].evidence?.status).toBe('ambiguous');
    expect(result.items![1].evidence?.signals).toHaveLength(0);
    expect(result.items![1].evidence?.provenance.operation).toBe('abstain_ambiguous_entity');

    // Item 3 (Unresolved) has unresolved evidence status and no signals
    expect(result.items![2].evidence?.status).toBe('unresolved');
    expect(result.items![2].evidence?.signals).toHaveLength(0);
    expect(result.items![2].evidence?.provenance.operation).toBe('abstain_unresolved_entity');

    // Verify evidence summary
    expect(result.evidenceSummary).toEqual({
      totalItems: 3,
      supportedCount: 1,
      insufficientCount: 0,
      unresolvedCount: 2
    });
  });
});
