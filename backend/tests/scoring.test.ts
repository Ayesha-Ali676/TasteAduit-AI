import { describe, it, expect } from 'vitest';
import { SCORING_WEIGHTS, ItemResolutionEnvelope } from '../src/services/orchestrator/stages.types.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';

describe('Stage 4: Deterministic Cultural Grounding Audit Engine', () => {
  const engine = new CulturalGroundingAuditEngine();

  // Helper to construct mock envelopes
  function createResolvedEnvelope(overrides: Partial<ItemResolutionEnvelope> = {}): ItemResolutionEnvelope {
    return {
      item: { id: 'it_1', name: 'Pulp Fiction' },
      resolution: {
        query: 'Pulp Fiction',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_pulp',
          name: 'Pulp Fiction',
          type: 'urn:entity:movie',
          category: 'entity',
          source: 'qloo',
          tags: ['Crime', 'Thriller', 'Dialogue', 'Cult classic'],
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
      },
      evidence: {
        status: 'supported',
        entityId: 'ent_pulp',
        entityName: 'Pulp Fiction',
        entityType: 'urn:entity:movie',
        signals: [
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_res_dogs',
            relatedEntityName: 'Reservoir Dogs',
            value: 0.951,
            tags: ['Crime', 'Thriller', 'Dialogue']
          },
          {
            signalType: 'cultural_tag',
            relatedEntityName: 'Cult classic',
            relatedEntityType: 'urn:tag:keyword:media'
          }
        ],
        summary: {
          signalsCount: 2,
          averageAffinity: 0.951,
          topAffinitySignal: 'Reservoir Dogs',
          hasLocationSignal: false
        },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights, /entities',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_1',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {
            userLocation: 'Los Angeles',
            locationFilterApplied: false
          },
          classification: 'Supported'
        }
      },
      ...overrides
    };
  }

  // 1. Four scoring dimensions
  it('should evaluate all four required scoring dimensions', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    expect(result.dimensions.culturalAlignment).toBeDefined();
    expect(result.dimensions.contextualRelevance).toBeDefined();
    expect(result.dimensions.constraintCompliance).toBeDefined();
    expect(result.dimensions.evidenceCompleteness).toBeDefined();
  });

  // 2. Correct weights
  it('should have weights summing exactly to 1.0 (100%)', () => {
    expect(SCORING_WEIGHTS.culturalAlignment).toBe(0.40);
    expect(SCORING_WEIGHTS.contextualRelevance).toBe(0.25);
    expect(SCORING_WEIGHTS.constraintCompliance).toBe(0.20);
    expect(SCORING_WEIGHTS.evidenceCompleteness).toBe(0.15);

    const sum =
      SCORING_WEIGHTS.culturalAlignment +
      SCORING_WEIGHTS.contextualRelevance +
      SCORING_WEIGHTS.constraintCompliance +
      SCORING_WEIGHTS.evidenceCompleteness;

    expect(Number(sum.toFixed(6))).toBe(1.0);
  });

  // 3. Weighted overall score
  it('should calculate overall score strictly from weighted sum of four dimensions', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    const expectedWeighted =
      result.dimensions.culturalAlignment.score * 0.40 +
      result.dimensions.contextualRelevance.score * 0.25 +
      result.dimensions.constraintCompliance.score * 0.20 +
      result.dimensions.evidenceCompleteness.score * 0.15;

    expect(result.overallScore).toBe(Math.round(expectedWeighted));
  });

  // 4. Score normalization
  it('should normalize each dimension to bounded 0-100 scale', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    Object.values(result.dimensions).forEach((dim) => {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  // 5. Supported evidence classification
  it('should classify high-affinity empirical evidence as Supported', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    expect(result.dimensions.culturalAlignment.classification).toBe('Supported');
    expect(result.decision.status).toBe('supported');
  });

  // 6. Inferred evidence classification
  it('should classify derived attributes as Inferred when signals are moderately correlated', () => {
    const envelope = createResolvedEnvelope({
      evidence: {
        status: 'supported',
        entityId: 'ent_mid',
        entityName: 'Mid Item',
        entityType: 'urn:entity:movie',
        signals: [
          {
            signalType: 'cultural_tag',
            relatedEntityName: 'Indie drama'
          }
        ],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/entities',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_mid',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      }
    });

    const result = engine.auditItem(envelope, { audience: 'Unrelated fans' });
    expect(result.dimensions.contextualRelevance.classification).toBe('Inferred');
  });

  // 7. Unverified evidence classification
  it('should classify dimension as Unverified when evidence is missing or conflicting', () => {
    const unverifiedEnvelope: ItemResolutionEnvelope = {
      item: { id: 'it_bad', name: 'Unknown Film' },
      resolution: {
        query: 'Unknown Film',
        status: 'unresolved',
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Unverified',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c_bad',
          resolutionStatus: 'unresolved'
        }
      }
    };

    const result = engine.auditItem(unverifiedEnvelope);
    expect(result.dimensions.culturalAlignment.classification).toBe('Unverified');
    expect(result.dimensions.culturalAlignment.score).toBe(0);
  });

  // 8. Missing evidence
  it('should handle missing evidence safely with score 0 for cultural alignment', () => {
    const envelope = createResolvedEnvelope({ evidence: undefined });
    const result = engine.auditItem(envelope);

    expect(result.dimensions.culturalAlignment.score).toBe(0);
    expect(result.dimensions.culturalAlignment.reasons[0]).toContain('No empirical Qloo cultural signals');
  });

  // 9. Insufficient evidence abstention
  it('should return insufficient_evidence decision status when evidence is insufficient regardless of arithmetic score', () => {
    const envelope = createResolvedEnvelope({
      evidence: {
        status: 'insufficient_evidence',
        entityId: 'ent_empty',
        entityName: 'Empty Item',
        entityType: 'urn:entity:movie',
        signals: [],
        summary: { signalsCount: 0, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: 'none',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_emp',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Unverified'
        }
      }
    });

    const result = engine.auditItem(envelope);
    expect(result.decision.status).toBe('insufficient_evidence');
    expect(result.decision.label).toContain('Insufficient Qloo Evidence');
  });

  // 10. Context relevance (audience keyword match)
  it('should increase contextual relevance score when cultural signals match audience keywords', () => {
    const envelope = createResolvedEnvelope();
    const resultMatching = engine.auditItem(envelope, { audience: 'Crime thriller fans' });
    const resultMismatch = engine.auditItem(envelope, { audience: 'Classical opera enthusiasts' });

    expect(resultMatching.dimensions.contextualRelevance.score).toBeGreaterThan(
      resultMismatch.dimensions.contextualRelevance.score
    );
    const matchedReasons = resultMatching.dimensions.contextualRelevance.reasons.join(' ');
    expect(matchedReasons).toContain("correlation with audience context 'Crime thriller fans'");
  });

  // 11. Location not falsely claimed as Qloo-filtered
  it('should NOT claim Qloo applied a location filter when locationFilterApplied is false', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope, { location: 'Los Angeles' });

    const reasons = result.dimensions.contextualRelevance.reasons.join(' ');
    expect(reasons).toContain('no false location filter claimed');
    expect(result.dimensions.contextualRelevance.classification).not.toBe('Supported');
  });

  // 12. Constraint pass
  it('should grant full compliance when all constraints pass', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope, { constraints: ['no romance', 'crime thriller'] });

    expect(result.dimensions.constraintCompliance.score).toBe(100);
    expect(result.dimensions.constraintCompliance.classification).toBe('Supported');
  });

  // 13. Constraint fail
  it('should penalize and flag constraint violation when excluded term is found in cultural attributes', () => {
    const envelope = createResolvedEnvelope();
    // 'Crime' is present in Pulp Fiction tags
    const result = engine.auditItem(envelope, { constraints: ['no crime'] });

    expect(result.dimensions.constraintCompliance.score).toBe(0);
    expect(result.dimensions.constraintCompliance.reasons[0]).toContain("[FAIL] Negative constraint 'no crime' violated");
    expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
  });

  // 14. Constraint unverified
  it('should classify unverified constraints (e.g. pricing) as unverified without pretending they passed', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope, { constraints: ['under $20 budget'] });

    expect(result.dimensions.constraintCompliance.score).toBe(50); // 50% partial score for unverified
    expect(result.dimensions.constraintCompliance.reasons[0]).toContain("[UNVERIFIED] Constraint 'under $20 budget' is an external dimension");
    expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
  });

  describe('Stage 4 Constraint Compliance Hardening (10 Deterministic Scenarios)', () => {
    // 1. no constraints
    it('1. no constraints -> score 100, neutral explanation, classification Supported', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: [] });

      expect(result.dimensions.constraintCompliance.score).toBe(100);
      expect(result.dimensions.constraintCompliance.classification).toBe('Supported');
      expect(result.dimensions.constraintCompliance.reasons).toEqual([
        'No explicit constraints were provided, so constraint compliance is neutral.'
      ]);
    });

    // 2. one verified positive constraint
    it('2. one verified positive constraint -> score 100 (full credit, not 50), classification Supported', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['crime thriller'] });

      expect(result.dimensions.constraintCompliance.score).toBe(100);
      expect(result.dimensions.constraintCompliance.classification).toBe('Supported');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[PASS] Positive constraint 'crime thriller' verified in Qloo cultural attributes."
      );
    });

    // 3. multiple verified positive constraints
    it('3. multiple verified positive constraints -> score 100, all PASS, classification Supported', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['crime thriller', 'cult classic'] });

      expect(result.dimensions.constraintCompliance.score).toBe(100);
      expect(result.dimensions.constraintCompliance.classification).toBe('Supported');
      expect(result.dimensions.constraintCompliance.reasons.length).toBe(2);
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain('[PASS]');
      expect(result.dimensions.constraintCompliance.reasons[1]).toContain('[PASS]');
    });

    // 4. one violated constraint
    it('4. one violated constraint -> score 0, FAIL, classification Unverified', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['no crime'] });

      expect(result.dimensions.constraintCompliance.score).toBe(0);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[FAIL] Negative constraint 'no crime' violated: conflicting attribute 'crime' found in Qloo evidence."
      );
    });

    // 5. mixed pass/fail constraints
    it('5. mixed pass/fail constraints (1 pass + 1 fail) -> score 50, classification Unverified', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['cult classic', 'no crime'] });

      expect(result.dimensions.constraintCompliance.score).toBe(50);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain('[PASS]');
      expect(result.dimensions.constraintCompliance.reasons[1]).toContain('[FAIL]');
    });

    // 6. unverified external constraint
    it('6. unverified external constraint -> score 50, UNVERIFIED, classification Unverified', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['under $20 budget'] });

      expect(result.dimensions.constraintCompliance.score).toBe(50);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[UNVERIFIED] Constraint 'under $20 budget' is an external dimension (pricing/dietary/amenity) not indexed in Qloo cultural taste graph."
      );
    });

    // 7. mixed verified + unverified constraints
    it('7. mixed verified + unverified constraints (1 pass + 1 unverified) -> score 75, classification Unverified', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['cult classic', 'under $20 budget'] });

      expect(result.dimensions.constraintCompliance.score).toBe(75);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain('[PASS]');
      expect(result.dimensions.constraintCompliance.reasons[1]).toContain('[UNVERIFIED]');
    });

    // 8. negative exclusion satisfied
    it('8. negative exclusion satisfied -> score 100, PASS, classification Supported', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['no romance'] });

      expect(result.dimensions.constraintCompliance.score).toBe(100);
      expect(result.dimensions.constraintCompliance.classification).toBe('Supported');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[PASS] Negative constraint 'no romance' satisfied: no conflicting attributes found in Qloo evidence."
      );
    });

    // 9. negative exclusion violated
    it('9. negative exclusion violated -> score 0, FAIL, classification Unverified', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['without dialogue'] });

      expect(result.dimensions.constraintCompliance.score).toBe(0);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[FAIL] Negative constraint 'without dialogue' violated: conflicting attribute 'dialogue' found in Qloo evidence."
      );
    });

    // 10. no constraint hallucination
    it('10. no constraint hallucination -> uncorroborated positive constraint is UNVERIFIED, score 50, never Supported', () => {
      const envelope = createResolvedEnvelope();
      const result = engine.auditItem(envelope, { constraints: ['french new wave documentary'] });

      expect(result.dimensions.constraintCompliance.score).toBe(50);
      expect(result.dimensions.constraintCompliance.classification).toBe('Unverified');
      expect(result.dimensions.constraintCompliance.reasons[0]).toContain(
        "[UNVERIFIED] Positive constraint 'french new wave documentary' not corroborated by available Qloo cultural tags."
      );
    });
  });

  // 15. Ambiguous entity
  it('should safely abstain and return insufficient_evidence for ambiguous entities', () => {
    const ambiguousEnvelope: ItemResolutionEnvelope = {
      item: { id: 'it_amb', name: 'Jazz' },
      resolution: {
        query: 'Jazz',
        status: 'ambiguous',
        reason: 'Multiple matches found',
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Inferred',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c_amb',
          resolutionStatus: 'ambiguous'
        }
      }
    };

    const result = engine.auditItem(ambiguousEnvelope);
    expect(result.decision.status).toBe('insufficient_evidence');
    expect(result.overallScore).toBeLessThan(30);
  });

  // 16. Unresolved entity
  it('should safely abstain and return insufficient_evidence for unresolved entities', () => {
    const unresolvedEnvelope: ItemResolutionEnvelope = {
      item: { id: 'it_unres', name: 'Nonexistent 123' },
      resolution: {
        query: 'Nonexistent 123',
        status: 'unresolved',
        candidates: [],
        provenance: {
          source: 'qloo-hackathon-api',
          operation: 'resolve_entity',
          classification: 'Unverified',
          retrievedAt: new Date().toISOString(),
          correlationId: 'c_unres',
          resolutionStatus: 'unresolved'
        }
      }
    };

    const result = engine.auditItem(unresolvedEnvelope);
    expect(result.decision.status).toBe('insufficient_evidence');
  });

  // 17. Evidence references
  it('should preserve traceable evidence references in evidenceRefs', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs.some((ref) => ref.includes('qloo:affinity') || ref.includes('qloo:entity'))).toBe(true);
  });

  // 18. Deterministic repeatability
  it('should produce identical scores and explanations when executed repeatedly with identical input', () => {
    const envelope = createResolvedEnvelope();
    const ctx = { audience: 'Cinema lovers', location: 'Tokyo', constraints: ['classic'] };

    const run1 = engine.auditItem(envelope, ctx);
    const run2 = engine.auditItem(envelope, ctx);

    expect(run1.overallScore).toBe(run2.overallScore);
    expect(run1.dimensions.culturalAlignment.score).toBe(run2.dimensions.culturalAlignment.score);
    expect(run1.dimensions.contextualRelevance.score).toBe(run2.dimensions.contextualRelevance.score);
    expect(run1.dimensions.constraintCompliance.score).toBe(run2.dimensions.constraintCompliance.score);
    expect(run1.dimensions.evidenceCompleteness.score).toBe(run2.dimensions.evidenceCompleteness.score);
    expect(run1.decision).toEqual(run2.decision);
  });

  // 19. Explanation traceability
  it('should ground explanation in empirical entity names and affinity percentages', () => {
    const envelope = createResolvedEnvelope();
    const result = engine.auditItem(envelope);

    const reasonsText = result.dimensions.culturalAlignment.reasons.join(' ');
    expect(reasonsText).toContain('Reservoir Dogs');
    expect(reasonsText).toContain('95.1%');
  });

  // 20. No fabricated Qloo evidence
  it('should never invent scores or signals when Qloo returns empty signals', () => {
    const envelope = createResolvedEnvelope({
      evidence: {
        status: 'supported',
        entityId: 'ent_raw',
        entityName: 'Raw Item',
        entityType: 'urn:entity:movie',
        signals: [],
        summary: { signalsCount: 0, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_0',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Unverified'
        }
      }
    });

    const result = engine.auditItem(envelope);
    expect(result.dimensions.culturalAlignment.score).toBe(0);
    expect(result.dimensions.culturalAlignment.evidenceRefs).toEqual([]);
  });

  // 21. Aggregate Report
  it('should aggregate multiple audited items into an overall report', () => {
    const item1 = engine.auditItem(createResolvedEnvelope());
    const item2 = engine.auditItem(createResolvedEnvelope());

    const report = engine.aggregateReport([item1, item2], {
      rawRecommendation: '1. Pulp Fiction\n2. Reservoir Dogs'
    });

    expect(report.totalItemsAudited).toBe(2);
    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.decision.status).toBe('supported');
    expect(report.itemsSummary.supportedCount).toBe(2);
  });

  // 22. Visual presentation-only invariance (Stage 7C-2)
  it('should guarantee that imageUrl is strictly presentation-only and does NOT affect scoring', () => {
    const envelopeWithoutImage = createResolvedEnvelope();
    const envelopeWithImage = createResolvedEnvelope({
      resolution: {
        ...envelopeWithoutImage.resolution,
        resolvedEntity: {
          ...envelopeWithoutImage.resolution.resolvedEntity!,
          imageUrl: 'https://images.qloo.com/i/ent_pulp-420x-auto.jpg'
        }
      }
    });

    const resultWithoutImage = engine.auditItem(envelopeWithoutImage);
    const resultWithImage = engine.auditItem(envelopeWithImage);

    // Exact score and dimension invariance
    expect(resultWithImage.overallScore).toBe(resultWithoutImage.overallScore);
    expect(resultWithImage.decision.status).toBe(resultWithoutImage.decision.status);
    expect(resultWithImage.dimensions.culturalAlignment.score).toBe(resultWithoutImage.dimensions.culturalAlignment.score);
    expect(resultWithImage.dimensions.contextualRelevance.score).toBe(resultWithoutImage.dimensions.contextualRelevance.score);
    expect(resultWithImage.dimensions.constraintCompliance.score).toBe(resultWithoutImage.dimensions.constraintCompliance.score);
    expect(resultWithImage.dimensions.evidenceCompleteness.score).toBe(resultWithoutImage.dimensions.evidenceCompleteness.score);
  });
});
