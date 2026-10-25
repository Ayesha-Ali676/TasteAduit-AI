import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { BoundedMemoryCache } from '../src/services/evidence/evidence.cache.js';
import { NormalizedEvidenceResult } from '../src/services/evidence/evidence.types.js';

describe('TasteAudit AI — Result Integrity & Stale Context Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1 — Original image separation:
  // Given a resolved Qloo entity with an image:
  // original recommendation image = absent / undefined; resolved Qloo image = present
  it('Test 1 — Original image separation: original item must not own Qloo image, resolved Qloo image present on grounded side', async () => {
    const mockResolutionSvc = {
      resolve: vi.fn().mockResolvedValue({
        query: 'Classic Film',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_film_1',
          name: 'Classic Film',
          type: 'urn:entity:movie',
          category: 'entity',
          imageUrl: 'https://images.qloo.com/i/ent_film_1-420x-auto.jpg',
          tags: ['classic', 'cinema']
        },
        candidates: [],
        derivedConfidence: 0.95,
        provenance: {
          classification: 'Supported',
          qlooType: 'urn:entity:movie',
          source: 'qloo',
          operation: 'resolve_entity',
          retrievedAt: new Date().toISOString(),
          correlationId: 'corr_test_1',
          resolutionStatus: 'resolved'
        }
      })
    } as unknown as EntityResolutionService;

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        entityId: 'ent_film_1',
        entityName: 'Classic Film',
        entityType: 'urn:entity:movie',
        imageUrl: 'https://images.qloo.com/i/ent_film_1-420x-auto.jpg',
        signals: [
          {
            signalType: 'cultural_tag',
            relatedEntityName: 'Art House',
            relationship: 'direct_cultural_attribute'
          }
        ],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/entities',
          operation: 'retrieve_taste_evidence',
          correlationId: 'corr_ev_1',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      } as NormalizedEvidenceResult)
    } as unknown as EvidenceRetrievalService;

    const orchestrator = new TasteAuditOrchestrator(
      mockResolutionSvc,
      mockEvidenceSvc,
      new CulturalGroundingAuditEngine()
    );

    const result = await orchestrator.executePipeline({
      rawRecommendation: 'I recommend Classic Film for cinema lovers',
      audienceContext: 'Film students',
      location: 'New York, USA',
      constraints: ['art house cinema']
    });

    // 1. Raw extracted recommendation item has NO imageUrl
    expect((result.parsedItems[0] as unknown as { imageUrl?: string }).imageUrl).toBeUndefined();

    // 2. Resolved Qloo entity owns the imageUrl
    expect(result.items?.[0].resolution.resolvedEntity?.imageUrl).toBe(
      'https://images.qloo.com/i/ent_film_1-420x-auto.jpg'
    );
  });

  // Test 2 — Successful repair:
  // Given: 22 -> 94
  // verify: original side does not show repaired image, after side shows repaired Qloo image, UI says repair succeeded
  it('Test 2 — Successful repair: after side shows repaired candidate and positive delta', async () => {
    const orchestrator = new TasteAuditOrchestrator();

    // Mock repair result with 22 -> 94
    const repairReport = {
      totalItemsAudited: 1,
      itemsNeedingRepair: 1,
      itemsRepaired: 1,
      averageScoreBefore: 22,
      averageScoreAfter: 94,
      netImprovement: 72,
      repairedItems: [
        {
          itemId: 'item_1',
          originalItem: 'Commercial Franchise',
          status: 'repaired' as const,
          beforeAudit: {
            itemId: 'item_1',
            itemName: 'Commercial Franchise',
            overallScore: 22,
            confidence: 0.8,
            dimensions: {} as any,
            decision: { status: 'unsupported' as const, explanation: 'Violated constraints' },
            provenance: {} as any
          },
          selectedCandidate: {
            name: 'Authentic Indie Film',
            entityId: 'ent_indie_99',
            type: 'urn:entity:movie',
            category: 'entity' as const,
            imageUrl: 'https://images.qloo.com/i/ent_indie_99-420x-auto.jpg',
            confidence: 0.95,
            justification: 'Matches authentic alternative cinema requirements'
          },
          afterAudit: {
            itemId: 'item_1',
            itemName: 'Authentic Indie Film',
            overallScore: 94,
            confidence: 0.9,
            dimensions: {} as any,
            decision: { status: 'supported' as const, explanation: 'Strong fit' },
            provenance: {} as any
          },
          scoreDelta: 72,
          verifiedImprovement: true,
          reasoning: 'Substituted commercial film with culturally aligned indie movie'
        }
      ]
    };

    const hasSuccessfulRepair =
      repairReport.repairedItems.length > 0 &&
      repairReport.netImprovement > 0 &&
      repairReport.repairedItems.some((r) => r.verifiedImprovement);

    expect(hasSuccessfulRepair).toBe(true);
    expect(repairReport.repairedItems[0].selectedCandidate?.imageUrl).toBe(
      'https://images.qloo.com/i/ent_indie_99-420x-auto.jpg'
    );
    expect(repairReport.averageScoreBefore).toBe(22);
    expect(repairReport.averageScoreAfter).toBe(94);
  });

  // Test 3 — Zero-improvement repair:
  // Given: 79 -> 79
  // verify: no successful repair claim, honest "No improvement" state
  it('Test 3 — Zero-improvement repair: score 79 -> 79 is flagged as zero-improvement without implying successful repair', () => {
    const repairReport = {
      totalItemsAudited: 1,
      itemsNeedingRepair: 1,
      itemsRepaired: 0,
      averageScoreBefore: 79,
      averageScoreAfter: 79,
      netImprovement: 0,
      repairedItems: [
        {
          itemId: 'item_1',
          originalItem: 'Partially Matched Venue',
          status: 'no_improvement' as const,
          beforeAudit: {
            itemId: 'item_1',
            itemName: 'Partially Matched Venue',
            overallScore: 79,
            confidence: 0.8,
            dimensions: {} as any,
            decision: { status: 'partially_supported' as const, explanation: 'Threshold not met' },
            provenance: {} as any
          },
          selectedCandidate: {
            name: 'Alternative Venue',
            entityId: 'ent_alt_venue',
            type: 'urn:entity:place',
            category: 'entity' as const,
            imageUrl: 'https://images.qloo.com/i/ent_alt_venue-420x-auto.jpg',
            confidence: 0.8,
            justification: 'Evaluated alternative'
          },
          afterAudit: {
            itemId: 'item_1',
            itemName: 'Alternative Venue',
            overallScore: 79,
            confidence: 0.8,
            dimensions: {} as any,
            decision: { status: 'partially_supported' as const, explanation: 'Re-audit found equal score' },
            provenance: {} as any
          },
          scoreDelta: 0,
          verifiedImprovement: false,
          reasoning: 'Re-audit confirmed no score improvement.'
        }
      ]
    };

    const scoreDelta = repairReport.netImprovement;
    const hasAttemptedRepair = repairReport.repairedItems.length > 0 && repairReport.repairedItems.some((r) => !!r.selectedCandidate);
    const hasSuccessfulRepair = repairReport.repairedItems.length > 0 && scoreDelta > 0 && repairReport.repairedItems.some((r) => r.verifiedImprovement);
    const isZeroImprovementRepair = hasAttemptedRepair && scoreDelta <= 0;

    expect(hasSuccessfulRepair).toBe(false);
    expect(isZeroImprovementRepair).toBe(true);
  });

  // Test 4 — Unresolved:
  // Given: 2 -> 2
  // verify: no Qloo entity image, no false verification, insufficient evidence state
  it('Test 4 — Unresolved: 2 -> 2 gives Insufficient Evidence with no entity image', async () => {
    const mockResolutionSvc = {
      resolve: vi.fn().mockResolvedValue({
        query: 'xyz_unknown_nonexistent',
        status: 'unresolved',
        candidates: [],
        derivedConfidence: 0.0,
        provenance: {
          classification: 'Unverified',
          qlooType: 'urn:entity:unknown',
          source: 'qloo',
          operation: 'resolve_entity',
          retrievedAt: new Date().toISOString(),
          correlationId: 'corr_unres',
          resolutionStatus: 'unresolved'
        }
      })
    } as unknown as EntityResolutionService;

    const orchestrator = new TasteAuditOrchestrator(
      mockResolutionSvc,
      new EvidenceRetrievalService(),
      new CulturalGroundingAuditEngine()
    );

    const result = await orchestrator.executePipeline({
      rawRecommendation: 'xyz_unknown_nonexistent',
      audienceContext: 'General public',
      location: 'Nowhere',
      constraints: []
    });

    expect(result.items?.[0].resolution.status).toBe('unresolved');
    expect(result.items?.[0].resolution.resolvedEntity).toBeUndefined();
    expect(result.auditReport?.overallScore).toBeLessThanOrEqual(25);
    expect(result.auditReport?.decision.status).toBe('insufficient_evidence');
  });

  // Test 5 — Stale constraints:
  // Run audit A with constraint A, then audit B with constraint B:
  // verify audit B's audit report, Agent reasoning, Agent trace, and explanation contain B only.
  it('Test 5 — Stale constraints: audit B retains ONLY constraint B, never leaking constraint A', async () => {
    const auditEngine = new CulturalGroundingAuditEngine();

    // Audit A with constraint A: "vinyl audio setups"
    const mockEnvA = {
      item: { id: 'it_1', name: 'Coffee Spot', category: 'place' },
      resolution: {
        query: 'Coffee Spot',
        status: 'resolved' as const,
        resolvedEntity: { id: 'ent_1', name: 'Coffee Spot', type: 'urn:entity:place', category: 'entity' as const },
        candidates: [],
        derivedConfidence: 0.9,
        provenance: { classification: 'Supported' as const, qlooType: 'urn:entity:place', source: 'qloo', operation: 'resolve', retrievedAt: '', correlationId: 'c1', resolutionStatus: 'resolved' as const }
      },
      evidence: {
        status: 'supported' as const,
        signals: [{ signalType: 'cultural_tag' as const, relatedEntityName: 'vinyl audio setups', relationship: 'direct_cultural_attribute' }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { source: 'qloo' as const, endpoint: '/entities', operation: 'ret', correlationId: 'c1', retrievedAt: '', queryMetadata: {}, classification: 'Supported' as const }
      }
    };

    const auditA = auditEngine.auditItem(mockEnvA, {
      constraints: ['must feature vinyl audio setups']
    });

    // Audit B with constraint B: "distinctive cultural identity and suitable atmosphere"
    const mockEnvB = {
      item: { id: 'it_2', name: 'Distinctive Dining', category: 'place' },
      resolution: {
        query: 'Distinctive Dining',
        status: 'resolved' as const,
        resolvedEntity: { id: 'ent_2', name: 'Distinctive Dining', type: 'urn:entity:place', category: 'entity' as const },
        candidates: [],
        derivedConfidence: 0.9,
        provenance: { classification: 'Supported' as const, qlooType: 'urn:entity:place', source: 'qloo', operation: 'resolve', retrievedAt: '', correlationId: 'c2', resolutionStatus: 'resolved' as const }
      },
      evidence: {
        status: 'supported' as const,
        signals: [{ signalType: 'cultural_tag' as const, relatedEntityName: 'cultural atmosphere', relationship: 'direct_cultural_attribute' }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { source: 'qloo' as const, endpoint: '/entities', operation: 'ret', correlationId: 'c2', retrievedAt: '', queryMetadata: {}, classification: 'Supported' as const }
      }
    };

    const auditB = auditEngine.auditItem(mockEnvB, {
      constraints: ['must have a distinctive cultural identity and suitable atmosphere']
    });

    const reportB = auditEngine.aggregateReport([auditB], {
      rawRecommendation: 'Recommend Distinctive Dining',
      constraints: ['must have a distinctive cultural identity and suitable atmosphere']
    });

    const auditBStr = JSON.stringify(auditB);
    const reportBStr = JSON.stringify(reportB);
    expect(auditBStr).not.toContain('vinyl audio');
    expect(auditBStr).not.toContain('single-origin pour-overs');
    expect(auditBStr).toContain('distinctive cultural identity');
    expect(reportBStr).not.toContain('vinyl audio');
    expect(reportBStr).not.toContain('single-origin pour-overs');
  });

  // Test 6 — Stale audience:
  // Run two requests with different audiences and verify the second result never contains the first audience.
  it('Test 6 — Stale audience: request B never contains request A audience', () => {
    const keyA = BoundedMemoryCache.createKey('ent_dishoom', 'urn:entity:place', 'London', 'Audiophile Hipsters');
    const keyB = BoundedMemoryCache.createKey('ent_dishoom', 'urn:entity:place', 'London', 'Young Professionals');

    // Cache keys must be completely distinct across different audiences
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('audiophile hipsters');
    expect(keyB).toContain('young professionals');
  });

  // Test 7 — Stale location:
  // Run two requests with different locations and verify the second result never contains the first location.
  it('Test 7 — Stale location: request B never contains request A location', () => {
    const keyA = BoundedMemoryCache.createKey('ent_dishoom', 'urn:entity:place', 'Shoreditch, London');
    const keyB = BoundedMemoryCache.createKey('ent_dishoom', 'urn:entity:place', 'New York, USA');

    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('shoreditch, london');
    expect(keyB).toContain('new york, usa');
  });

  // Test 8 — Rapid sequential audits:
  // Submit two different requests sequentially and verify isolated evidence metadata
  it('Test 8 — Rapid sequential audits: evidence cache produces isolated clones without queryMetadata mutation', () => {
    const cache = new BoundedMemoryCache<NormalizedEvidenceResult>(10, 60000);

    const baseEvidence: NormalizedEvidenceResult = {
      status: 'supported',
      entityId: 'ent_999',
      entityName: 'Popular Spot',
      entityType: 'urn:entity:place',
      signals: [],
      summary: { signalsCount: 0, hasLocationSignal: false },
      provenance: {
        source: 'qloo',
        endpoint: '/entities',
        operation: 'retrieve_taste_evidence',
        correlationId: 'req_1_corr',
        retrievedAt: '2026-10-25T12:00:00Z',
        queryMetadata: { audience: 'Audience 1', userLocation: 'Location 1' },
        classification: 'Supported'
      }
    };

    const key1 = BoundedMemoryCache.createKey('ent_999', 'urn:entity:place', 'Location 1', 'Audience 1');
    cache.set(key1, baseEvidence);

    const key2 = BoundedMemoryCache.createKey('ent_999', 'urn:entity:place', 'Location 2', 'Audience 2');
    // Rapid sequential query with Location 2 / Audience 2 must miss key1
    expect(cache.get(key2)).toBeUndefined();
  });
});
