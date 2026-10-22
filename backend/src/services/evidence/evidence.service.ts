import crypto from 'crypto';
import { qlooClient, ServerQlooClient } from '../qloo/qloo.client.js';
import { BoundedMemoryCache } from './evidence.cache.js';
import {
  RetrieveEvidenceInput,
  NormalizedEvidenceResult,
  NormalizedEvidenceSignal
} from './evidence.types.js';
import { logger } from '../../utils/logger.js';

export class EvidenceRetrievalService {
  private readonly client: ServerQlooClient;
  private readonly cache: BoundedMemoryCache<NormalizedEvidenceResult>;

  constructor(client: ServerQlooClient = qlooClient, cache = new BoundedMemoryCache<NormalizedEvidenceResult>(100, 300000)) {
    this.client = client;
    this.cache = cache;
  }

  /**
   * Retrieves taste-graph evidence and cultural signals for a resolved Qloo entity or tag.
   * Leverages bounded process-local caching and safe error abstention.
   */
  public async retrieveEvidence(input: RetrieveEvidenceInput): Promise<NormalizedEvidenceResult> {
    const correlationId = `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const retrievedAt = new Date().toISOString();

    const isWktLocation = Boolean(
      input.location && /^(POINT|POLYGON|LINESTRING|GEOMETRYCOLLECTION)\s*\(/i.test(input.location.trim())
    );

    const queryMetadata = {
      entityId: input.entityId,
      entityName: input.entityName,
      entityType: input.entityType,
      category: input.category,
      userLocation: input.location || null,
      locationFilterApplied: isWktLocation,
      audience: input.audience || null
    };

    // 1. Check bounded process-local cache first
    const cacheKey = BoundedMemoryCache.createKey(input.entityId, input.entityType, input.location);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`Evidence cache hit for entity "${input.entityName}" (${input.entityId})`);
      return cached;
    }

    // 2. Determine target query parameters for /v2/insights
    const isTag = input.category === 'tag' || input.entityId.startsWith('urn:tag:');
    const signalEntityId = isTag ? undefined : input.entityId;
    const signalTagId = isTag ? input.entityId : undefined;

    // Cross-domain target type selection: if entity is an artist/music, look for related media or artists
    let targetType = 'urn:entity:artist';
    if (input.entityType.includes('movie')) {
      targetType = 'urn:entity:movie';
    } else if (input.entityType.includes('place') || input.entityType.includes('restaurant')) {
      targetType = 'urn:entity:place';
    } else if (input.entityType.includes('artist') || input.entityType.includes('genre:music')) {
      targetType = 'urn:entity:artist';
    }

    logger.info(`Retrieving Qloo evidence for "${input.entityName}" (type: ${input.entityType})...`);

    // 3. Dispatch parallel retrieval: /v2/insights and /entities
    const [insightsResult, detailsResult] = await Promise.allSettled([
      this.client.getInsights({
        signalEntityId,
        signalTagId,
        targetType,
        location: input.location,
        take: 5
      }),
      signalEntityId ? this.client.getEntityDetails(signalEntityId) : Promise.resolve(null)
    ]);

    const signals: NormalizedEvidenceSignal[] = [];

    // Process /v2/insights signals (Empirical taste affinity correlations)
    if (insightsResult.status === 'fulfilled' && Array.isArray(insightsResult.value)) {
      insightsResult.value.forEach((item, index) => {
        const affinityVal = typeof item.query?.affinity === 'number' ? item.query.affinity : undefined;
        const tagNames = item.tags ? item.tags.map((t) => t.name).filter(Boolean).slice(0, 4) : [];

        signals.push({
          signalType: 'taste_affinity',
          relatedEntityId: item.entity_id,
          relatedEntityName: item.name,
          relatedEntityType: item.types && item.types.length > 0 ? item.types[0] : undefined,
          value: affinityVal, // Empirical Qloo affinity; never fabricated
          rank: index + 1,
          relationship: 'high_taste_affinity',
          context: {
            audience: input.audience,
            location: input.location
          },
          tags: tagNames.length > 0 ? tagNames : undefined
        });
      });
    } else if (insightsResult.status === 'rejected') {
      logger.warn(`Insights retrieval failed for "${input.entityName}":`, insightsResult.reason?.message);
    }

    // Process /entities signals (Direct cultural attributes and tags)
    if (detailsResult.status === 'fulfilled' && detailsResult.value) {
      const details = detailsResult.value;
      if (details.tags && Array.isArray(details.tags)) {
        details.tags.slice(0, 5).forEach((t) => {
          signals.push({
            signalType: 'cultural_tag',
            relatedEntityName: t.name,
            relatedEntityType: t.type,
            relationship: 'direct_cultural_attribute'
          });
        });
      }
    }

    // 4. Abstention if insufficient evidence found
    if (signals.length === 0) {
      logger.info(`Insufficient Qloo evidence for "${input.entityName}". Abstaining safely.`);
      const result: NormalizedEvidenceResult = {
        status: 'insufficient_evidence',
        entityId: input.entityId,
        entityName: input.entityName,
        entityType: input.entityType,
        signals: [],
        summary: {
          signalsCount: 0,
          hasLocationSignal: false
        },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights, /entities',
          operation: 'retrieve_taste_evidence',
          correlationId,
          retrievedAt,
          queryMetadata,
          classification: 'Unverified'
        }
      };

      this.cache.set(cacheKey, result);
      return result;
    }

    // 5. Compute empirical summary
    const affinityValues = signals.map((s) => s.value).filter((v): v is number => typeof v === 'number');
    const averageAffinity = affinityValues.length > 0
      ? Math.round((affinityValues.reduce((sum, v) => sum + v, 0) / affinityValues.length) * 1000) / 1000
      : undefined;

    const topAffinitySignal = signals.find((s) => s.signalType === 'taste_affinity')?.relatedEntityName;
    const hasLocationSignal = Boolean(input.location && signals.some((s) => s.context?.location));

    const result: NormalizedEvidenceResult = {
      status: 'supported',
      entityId: input.entityId,
      entityName: input.entityName,
      entityType: input.entityType,
      signals,
      summary: {
        signalsCount: signals.length,
        averageAffinity,
        topAffinitySignal,
        hasLocationSignal
      },
      provenance: {
        source: 'qloo',
        endpoint: '/v2/insights, /entities',
        operation: 'retrieve_taste_evidence',
        correlationId,
        retrievedAt,
        queryMetadata,
        classification: 'Supported'
      }
    };

    // Cache the verified result
    this.cache.set(cacheKey, result);
    return result;
  }
}

export const evidenceService = new EvidenceRetrievalService();
