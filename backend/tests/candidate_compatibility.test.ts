import { describe, it, expect, vi } from 'vitest';
import {
  evaluateCandidateCompatibility,
  evaluateCandidateSemanticType,
  resolveTargetSemanticDomain
} from '../src/services/resolution/context.matcher.js';
import { RepairService } from '../src/services/repair/repair.service.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { ItemResolutionEnvelope } from '../src/services/orchestrator/stages.types.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';

describe('Candidate Semantic Compatibility & Firewall (Generic Fixtures)', () => {
  // Helper to build a generic envelope
  function createGenericEnvelope(params: {
    category?: string;
    resolvedType?: string;
    resolvedTags?: string[];
    signals?: Array<{
      id: string;
      name: string;
      type?: string;
      tags?: string[];
      value?: number;
    }>;
  }): ItemResolutionEnvelope {
    const signals = (params.signals || []).map((s, idx) => ({
      signalType: 'taste_affinity' as const,
      relatedEntityId: s.id,
      relatedEntityName: s.name,
      relatedEntityType: s.type,
      value: s.value ?? 0.9,
      rank: idx + 1,
      tags: s.tags || []
    }));

    return {
      item: { id: 'generic_item_1', name: 'Generic Target', category: params.category },
      resolution: {
        query: 'Generic Target',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_target_1',
          name: 'Generic Target',
          type: params.resolvedType || 'urn:entity:place',
          category: 'entity',
          source: 'qloo',
          tags: params.resolvedTags || [],
          retrievedAt: new Date().toISOString()
        },
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Supported',
          retrievedAt: new Date().toISOString(),
          correlationId: 'gen_corr_1',
          resolutionStatus: 'resolved'
        }
      },
      evidence: {
        status: 'supported',
        entityId: 'ent_target_1',
        entityName: 'Generic Target',
        entityType: params.resolvedType || 'urn:entity:place',
        signals,
        summary: { signalsCount: signals.length, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'retrieve_taste_evidence',
          correlationId: 'gen_ev_1',
          retrievedAt: new Date().toISOString(),
          classification: 'Supported'
        }
      }
    };
  }

  // -------------------------------------------------------------------------
  // 1. Compatibility Tests 1 - 10
  // -------------------------------------------------------------------------
  describe('10 Step Compatibility Rules', () => {
    // 1. movie target + movie candidate -> compatible
    it('1. movie target + movie candidate -> compatible', () => {
      const target = createGenericEnvelope({
        category: 'movie',
        resolvedType: 'urn:entity:movie'
      });
      const candidate = {
        name: 'Generic Film B',
        type: 'urn:entity:movie'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(true);
      expect(result.targetDomain).toBe('movie');
      expect(result.candidateDomain).toBe('movie');
    });

    // 2. movie target + restaurant candidate -> rejected
    it('2. movie target + restaurant candidate -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'movie',
        resolvedType: 'urn:entity:movie'
      });
      const candidate = {
        name: 'Generic Bistro',
        type: 'urn:entity:place',
        tags: ['restaurant', 'dining']
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });

    // 3. movie target + music artist -> rejected
    it('3. movie target + music artist -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'movie',
        resolvedType: 'urn:entity:movie'
      });
      const candidate = {
        name: 'Generic Musical Artist',
        type: 'urn:entity:artist'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });

    // 4. music target + artist -> compatible
    it('4. music target + artist -> compatible', () => {
      const target = createGenericEnvelope({
        category: 'music',
        resolvedType: 'urn:entity:artist'
      });
      const candidate = {
        name: 'Generic Singer Songwriter',
        type: 'urn:entity:artist'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(true);
      expect(result.targetDomain).toBe('music');
      expect(result.candidateDomain).toBe('music');
    });

    // 5. music target + restaurant -> rejected
    it('5. music target + restaurant -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'music',
        resolvedType: 'urn:entity:artist'
      });
      const candidate = {
        name: 'Generic Food Spot',
        type: 'urn:entity:place',
        tags: ['restaurant']
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });

    // 6. dining target + place -> compatible
    it('6. dining target + place -> compatible', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const candidate = {
        name: 'Generic Eatery',
        type: 'urn:entity:place'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(true);
      expect(result.targetDomain).toBe('dining');
      expect(result.candidateDomain).toBe('dining');
    });

    // 7. dining target + restaurant -> compatible
    it('7. dining target + restaurant -> compatible', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const candidate = {
        name: 'Generic Brasserie',
        type: 'urn:entity:restaurant'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(true);
      expect(result.targetDomain).toBe('dining');
      expect(result.candidateDomain).toBe('dining');
    });

    // 8. dining target + movie -> rejected
    it('8. dining target + movie -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const candidate = {
        name: 'Generic Theatrical Release',
        type: 'urn:entity:movie'
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });

    // 9. dining target + artist -> rejected
    it('9. dining target + artist -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const candidate = {
        name: 'Generic Vocalist',
        type: 'urn:entity:artist',
        tags: ['Electronic Music', 'Soul']
      };
      const result = evaluateCandidateCompatibility(target, candidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });

    // 10. dining target + compatible brand/venue -> compatible only when normalized context/tags supports it
    it('10a. dining target + brand candidate with dining tags -> compatible', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const brandCandidateWithFoodTags = {
        name: 'Generic Hospitality Brand',
        type: 'urn:entity:brand',
        tags: ['Restaurant', 'Dining', 'Hospitality']
      };
      const result = evaluateCandidateCompatibility(target, brandCandidateWithFoodTags);
      expect(result.isCompatible).toBe(true);
      expect(result.candidateDomain).toBe('dining');
      expect(result.normalizedSemanticType).toBe('dining brand / venue');
    });

    it('10b. dining target + brand candidate without dining tags -> rejected', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place'
      });
      const genericTechBrandCandidate = {
        name: 'Generic Tech Brand',
        type: 'urn:entity:brand',
        tags: ['Consumer Electronics', 'Technology']
      };
      const result = evaluateCandidateCompatibility(target, genericTechBrandCandidate);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('incompatible_semantic_type');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Candidate Firewall Verification
  // -------------------------------------------------------------------------
  describe('Candidate Compatibility Firewall Pipeline Enforcement', () => {
    it('filters incompatible affinity signals out before they reach getVerifiedCandidates', async () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:brand',
        resolvedTags: ['Indian Restaurant', 'London', 'Dining'],
        signals: [
          {
            id: 'sig_artist_1',
            name: 'Affinity Music Artist',
            type: 'urn:entity:artist',
            tags: ['Alternative R&B', 'Electronic'],
            value: 0.95
          },
          {
            id: 'sig_place_1',
            name: 'Affinity Dining Spot',
            type: 'urn:entity:place',
            tags: ['Restaurant', 'Food'],
            value: 0.88
          }
        ]
      });

      const mockQloo = { searchCandidates: vi.fn().mockResolvedValue([]) };
      const repairSvc = new RepairService({ qloo: mockQloo as any });
      const verifiedCandidates = await repairSvc.getVerifiedCandidates(target);

      // Only the dining spot must survive the firewall; the music artist must be rejected
      expect(verifiedCandidates.some((c) => c.entityId === 'sig_artist_1')).toBe(false);
      expect(verifiedCandidates.some((c) => c.entityId === 'sig_place_1')).toBe(true);
    });

    it('rejected candidate cannot become suggestedCandidateId or trigger REPAIR in Agent loop', async () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place',
        signals: [
          {
            id: 'incompatible_artist_1',
            name: 'Cross Domain Musician',
            type: 'urn:entity:artist',
            value: 0.98
          }
        ]
      });

      // Audit target
      const auditEngine = new CulturalGroundingAuditEngine();
      target.audit = {
        ...auditEngine.auditItem(target),
        overallScore: 50,
        decision: { status: 'unverified', label: 'Weak Grounding', explanation: 'Low score' },
        dimensions: {
          ...auditEngine.auditItem(target).dimensions,
          constraintCompliance: {
            name: 'constraintCompliance',
            score: 40,
            weight: 0.2,
            weightedScore: 8,
            classification: 'Unverified',
            reasons: ['Constraint unverified.'],
            evidenceRefs: []
          }
        }
      };

      // Mock AI that attempts to suggest the incompatible candidate
      const mockAI = {
        name: 'mock' as const,
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          provider: 'mock',
          model: 'mock-model',
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: target.item.id,
            suggestedCandidateId: 'incompatible_artist_1',
            reasoning: 'Attempting to repair dining recommendation with a music artist.'
          })
        })
      };

      const aiProvider = new AIOrchestratorProvider({ primaryProvider: mockAI as any });
      const mockQloo = { searchCandidates: vi.fn().mockResolvedValue([]) };
      const repairSvc = new RepairService({ qloo: mockQloo as any, ai: aiProvider });
      const agentLoop = new TasteAuditAgentLoop({ ai: aiProvider, repairSvc });

      const parseInput = { rawRecommendation: 'Generic Target', constraints: [] };
      const overallReport = auditEngine.aggregateReport([target.audit!], parseInput);
      const loopResult = await agentLoop.runLoop(
        parseInput,
        [target],
        overallReport,
        { maxIterations: 1 }
      );

      // Incompatible candidate was rejected before reaching candidatesMap
      expect(loopResult.trace.terminalState).toBe('STOPPED');
      expect(loopResult.envelopes[0].repair).toBeUndefined();
      expect(loopResult.trace.events.some((e) => e.decision === 'REPAIR')).toBe(false);
    });

    it('candidate filtering does not alter the Stage 4 deterministic audit score', () => {
      const target = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:brand',
        resolvedTags: ['Indian Restaurant', 'London', 'Dining'],
        signals: [
          {
            id: 'sig_artist_1',
            name: 'Affinity Music Artist',
            type: 'urn:entity:artist',
            value: 0.95
          }
        ]
      });

      const auditEngine = new CulturalGroundingAuditEngine();
      const scoreBeforeFiltering = auditEngine.auditItem(target).overallScore;

      // Filtering candidates for repair
      const repairSvc = new RepairService();
      repairSvc.getVerifiedCandidates(target);

      // Deterministic re-audit of original envelope
      const scoreAfterFiltering = auditEngine.auditItem(target).overallScore;

      expect(scoreBeforeFiltering).toBe(scoreAfterFiltering);
      expect(scoreAfterFiltering).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Explanation Integrity
  // -------------------------------------------------------------------------
  describe('Semantic Explanation Integrity', () => {
    it('evaluates artist as music artist (never movies)', () => {
      const candidate = {
        name: 'Generic Musician',
        type: 'urn:entity:artist'
      };
      const evaluation = evaluateCandidateSemanticType(candidate);
      expect(evaluation.domain).toBe('music');
      expect(evaluation.normalizedSemanticType).toBe('music artist');
      expect(evaluation.normalizedSemanticType).not.toContain('movie');
    });

    it('evaluates movie as movie', () => {
      const candidate = {
        name: 'Generic Cinema Title',
        type: 'urn:entity:movie'
      };
      const evaluation = evaluateCandidateSemanticType(candidate);
      expect(evaluation.domain).toBe('movie');
      expect(evaluation.normalizedSemanticType).toBe('movie');
    });

    it('evaluates restaurant/place as place / restaurant', () => {
      const candidate = {
        name: 'Generic Venue',
        type: 'urn:entity:place'
      };
      const evaluation = evaluateCandidateSemanticType(candidate);
      expect(evaluation.domain).toBe('dining');
      expect(evaluation.normalizedSemanticType).toBe('place / restaurant');
    });

    it('returns strict unverified message without guessing when type cannot be confidently verified', () => {
      const candidate = {
        name: 'Generic Ambiguous Entity',
        type: 'urn:entity:unknown',
        tags: []
      };
      const evaluation = evaluateCandidateSemanticType(candidate);
      expect(evaluation.isConfident).toBe(false);
      expect(evaluation.normalizedSemanticType).toBe('Candidate semantic type could not be confidently verified.');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Safe Behavior when Zero Compatible Candidates Exist
  // -------------------------------------------------------------------------
  describe('Zero Compatible Candidates Safety', () => {
    it('safely handles situation when all Qloo affinity signals are incompatible', async () => {
      const diningTarget = createGenericEnvelope({
        category: 'dining',
        resolvedType: 'urn:entity:place',
        signals: [
          {
            id: 'm1',
            name: 'Song Title',
            type: 'urn:entity:artist',
            value: 0.99
          },
          {
            id: 'm2',
            name: 'Movie Title',
            type: 'urn:entity:movie',
            value: 0.97
          }
        ]
      });

      const auditEngine = new CulturalGroundingAuditEngine();
      diningTarget.audit = {
        ...auditEngine.auditItem(diningTarget),
        overallScore: 50,
        decision: { status: 'unverified', label: 'Weak Grounding', explanation: 'Low score' },
        dimensions: {
          ...auditEngine.auditItem(diningTarget).dimensions,
          constraintCompliance: {
            name: 'constraintCompliance',
            score: 40,
            weight: 0.2,
            weightedScore: 8,
            classification: 'Unverified',
            reasons: ['Constraint unverified.'],
            evidenceRefs: []
          }
        }
      };

      // Secondary search returns no candidates
      const mockQloo = {
        searchCandidates: vi.fn().mockResolvedValue([])
      };

      const repairSvc = new RepairService({ qloo: mockQloo as any });
      const candidates = await repairSvc.getVerifiedCandidates(diningTarget);

      expect(candidates).toHaveLength(0);

      // Now run repairItem with 0 candidates
      const repairResult = await repairSvc.repairItem(diningTarget);
      expect(repairResult.status).toBe('insufficient_evidence');
      expect(repairResult.reasoning).toContain('Evidence Firewall');
      expect(repairResult.selectedCandidate).toBeUndefined();
    });
  });
});
