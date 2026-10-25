import { describe, it, expect, vi } from 'vitest';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { ServerQlooClient } from '../src/services/qloo/qloo.client.js';
import { NormalizedCandidate } from '../src/services/qloo/qloo.types.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { ItemResolutionEnvelope } from '../src/services/orchestrator/stages.types.js';

describe('Phase 1 Foundation Hardening: Universal Resolution & Qloo Evidence', () => {
  const mockClient = new ServerQlooClient({ apiKey: 'mock-key' });
  const resolutionService = new EntityResolutionService(mockClient);
  const auditEngine = new CulturalGroundingAuditEngine();

  // 1. city + country location
  it('1. should generically match city + country location (e.g., "Seattle, USA" to tag "Seattle Washington")', async () => {
    const candidate1: NormalizedCandidate = {
      id: 'ent_venue_1',
      name: 'Coffee House',
      type: 'urn:entity:place',
      category: 'entity',
      disambiguation: '4th Ave',
      tags: ['Seattle Washington', 'Espresso'],
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };
    const candidate2: NormalizedCandidate = {
      id: 'ent_venue_2',
      name: 'Coffee House',
      type: 'urn:entity:place',
      category: 'entity',
      disambiguation: 'Queen Street',
      tags: ['Auckland New Zealand'],
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidate1, candidate2]);

    const res = await resolutionService.resolve('Coffee House', {
      location: 'Seattle, USA'
    });

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.id).toBe('ent_venue_1');
  });

  // 2. city + state location
  it('2. should generically match city + state location (e.g., "Miami, FL" to tag "Miami Florida")', async () => {
    const candidate1: NormalizedCandidate = {
      id: 'ent_miami',
      name: 'Bistro Cafe',
      type: 'urn:entity:place',
      category: 'entity',
      disambiguation: 'Ocean Drive',
      tags: ['Miami Florida', 'Seafood'],
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidate1]);

    const res = await resolutionService.resolve('Bistro Cafe', {
      location: 'Miami, FL'
    });

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.id).toBe('ent_miami');
  });

  // 3. location without country
  it('3. should generically match location without country (e.g., "Berlin" to tag "Berlin Germany")', async () => {
    const candidate1: NormalizedCandidate = {
      id: 'ent_berlin',
      name: 'Techno Club',
      type: 'urn:entity:place',
      category: 'entity',
      tags: ['Berlin Germany', 'Nightlife'],
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidate1]);

    const res = await resolutionService.resolve('Techno Club', {
      location: 'Berlin'
    });

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.id).toBe('ent_berlin');
  });

  // 4. same-name entities with different types
  it('4. should distinguish same-name entities of different types using request context', async () => {
    const movieCandidate: NormalizedCandidate = {
      id: 'ent_sample_movie',
      name: 'Sample Title',
      type: 'urn:entity:movie',
      category: 'entity',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };
    const albumCandidate: NormalizedCandidate = {
      id: 'ent_sample_album',
      name: 'Sample Title',
      type: 'urn:entity:album',
      category: 'entity',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([movieCandidate, albumCandidate]);

    const res = await resolutionService.resolve('Sample Title', {
      audience: 'Film enthusiasts and cinema lovers'
    });

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.id).toBe('ent_sample_movie');
    expect(res.resolvedEntity?.type).toBe('urn:entity:movie');
  });

  // 5. genuinely ambiguous entity
  it('5. should remain genuinely ambiguous when no distinguishing context exists', async () => {
    const cand1: NormalizedCandidate = {
      id: 'ent_amb_1',
      name: 'Generic Title',
      type: 'urn:entity:movie',
      category: 'entity',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };
    const cand2: NormalizedCandidate = {
      id: 'ent_amb_2',
      name: 'Generic Title',
      type: 'urn:entity:album',
      category: 'entity',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([cand1, cand2]);

    const res = await resolutionService.resolve('Generic Title');

    expect(res.status).toBe('ambiguous');
    expect(res.resolvedEntity).toBeUndefined();
    expect(res.candidates).toHaveLength(2);
  });

  // 6. nonexistent entity
  it('6. should return unresolved for nonexistent entity', async () => {
    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([]);

    const res = await resolutionService.resolve('Nonexistent Mystery Object 12345');

    expect(res.status).toBe('unresolved');
    expect(res.resolvedEntity).toBeUndefined();
    expect(res.candidates).toEqual([]);
  });

  // 7. resolved Qloo evidence
  it('7. should retrieve real Qloo evidence signals for resolved entity', async () => {
    const evidenceService = new EvidenceRetrievalService(mockClient);

    vi.spyOn(mockClient, 'getInsights').mockResolvedValueOnce([
      {
        entity_id: 'ent_rel_1',
        name: 'Related Cultural Work',
        types: ['urn:entity:movie'],
        query: { affinity: 0.94 },
        tags: [{ name: 'Thriller', type: 'genre' }]
      }
    ]);
    vi.spyOn(mockClient, 'getEntityDetails').mockResolvedValueOnce({
      entity_id: 'ent_target_1',
      name: 'Target Film',
      types: ['urn:entity:movie']
    });

    const evidence = await evidenceService.retrieveEvidence({
      entityId: 'ent_target_1',
      entityName: 'Target Film',
      entityType: 'urn:entity:movie',
      category: 'entity'
    });

    expect(evidence.status).toBe('supported');
    expect(evidence.signals.length).toBeGreaterThan(0);
    expect(evidence.signals[0].relatedEntityId).toBe('ent_rel_1');
    expect(evidence.signals[0].value).toBe(0.94);
    expect(evidence.provenance.source).toBe('qloo');
  });

  // 8. ambiguous retrieval abstention
  it('8. should safely abstain from Stage 3 RETRIEVE when entity is ambiguous', async () => {
    const orchestrator = new TasteAuditOrchestrator(resolutionService);

    // Mock resolve returning ambiguous
    vi.spyOn(resolutionService, 'resolve').mockResolvedValueOnce({
      query: 'Ambiguous Query',
      status: 'ambiguous',
      candidates: [],
      provenance: {
        source: 'qloo-hackathon-api',
        operation: 'resolve_entity',
        classification: 'Inferred',
        retrievedAt: new Date().toISOString(),
        correlationId: 'c_test',
        resolutionStatus: 'ambiguous'
      }
    });

    const pipelineRes = await orchestrator.executePipeline({
      rawRecommendation: 'Ambiguous Query'
    }, { enableAgent: false, enableRepair: false });

    expect(pipelineRes.items?.[0].resolution.status).toBe('ambiguous');
    expect(pipelineRes.items?.[0].evidence?.status).toBe('ambiguous');
    expect(pipelineRes.items?.[0].evidence?.signals).toHaveLength(0);
    expect(pipelineRes.items?.[0].evidence?.provenance.operation).toBe('abstain_ambiguous_entity');
  });

  // 9. image metadata present
  it('9. should preserve native image metadata when provided by Qloo candidate', async () => {
    const candidateWithImage: NormalizedCandidate = {
      id: 'ent_with_img',
      name: 'Visual Masterpiece',
      type: 'urn:entity:movie',
      category: 'entity',
      imageUrl: 'https://images.qloo.com/i/ent_with_img-420x-auto.jpg',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidateWithImage]);

    const res = await resolutionService.resolve('Visual Masterpiece');

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.imageUrl).toBe('https://images.qloo.com/i/ent_with_img-420x-auto.jpg');
  });

  // 10. image metadata absent
  it('10. should leave imageUrl absent/undefined when Qloo does not have an image', async () => {
    const candidateWithoutImage: NormalizedCandidate = {
      id: 'ent_no_img',
      name: 'Obscure Indietronica',
      type: 'urn:entity:artist',
      category: 'entity',
      imageUrl: undefined,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidateWithoutImage]);

    const res = await resolutionService.resolve('Obscure Indietronica');

    expect(res.status).toBe('resolved');
    expect(res.resolvedEntity?.imageUrl).toBeUndefined();
  });

  // 11. image metadata has no effect on score
  it('11. should confirm image metadata is presentation-only and has zero effect on deterministic audit score', () => {
    const baseEnvelope: ItemResolutionEnvelope = {
      item: { id: 'it_test', name: 'Test Concept' },
      resolution: {
        query: 'Test Concept',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_test',
          name: 'Test Concept',
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
          correlationId: 'c_test',
          resolutionStatus: 'resolved'
        }
      },
      evidence: {
        status: 'supported',
        signals: [
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_2',
            relatedEntityName: 'Related Item',
            value: 0.90
          }
        ],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'affinity_query',
          correlationId: 'c_ev',
          retrievedAt: new Date().toISOString(),
          classification: 'Supported'
        }
      }
    };

    // Envelope A: with high-res image
    const envelopeWithImage: ItemResolutionEnvelope = {
      ...baseEnvelope,
      resolution: {
        ...baseEnvelope.resolution,
        resolvedEntity: {
          ...baseEnvelope.resolution.resolvedEntity!,
          imageUrl: 'https://images.qloo.com/i/test-420x-auto.jpg'
        }
      }
    };

    // Envelope B: without image
    const envelopeWithoutImage: ItemResolutionEnvelope = {
      ...baseEnvelope,
      resolution: {
        ...baseEnvelope.resolution,
        resolvedEntity: {
          ...baseEnvelope.resolution.resolvedEntity!,
          imageUrl: undefined
        }
      }
    };

    const auditA = auditEngine.auditItem(envelopeWithImage);
    const auditB = auditEngine.auditItem(envelopeWithoutImage);

    expect(auditA.overallScore).toBe(auditB.overallScore);
    expect(auditA.dimensions.culturalAlignment.score).toBe(auditB.dimensions.culturalAlignment.score);
    expect(auditA.dimensions.contextualRelevance.score).toBe(auditB.dimensions.contextualRelevance.score);
    expect(auditA.dimensions.constraintCompliance.score).toBe(auditB.dimensions.constraintCompliance.score);
    expect(auditA.dimensions.evidenceCompleteness.score).toBe(auditB.dimensions.evidenceCompleteness.score);
  });
});
