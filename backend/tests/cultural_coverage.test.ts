import { describe, it, expect, vi } from 'vitest';
import { CulturalCoverageService, isQualityCulturalTag } from '../src/services/coverage/coverage.service.js';
import { ItemResolutionEnvelope, ParseStageInput } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult } from '../src/services/audit/audit.types.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { NormalizedEvidenceResult } from '../src/services/evidence/evidence.types.js';

function createMockItemAudit(score: number): ItemAuditResult {
  return {
    itemId: 'it_mock',
    itemName: 'Mock Item',
    overallScore: score,
    dimensions: {
      culturalAlignment: { score, classification: 'Supported', explanation: '', evidenceRefs: [] },
      contextualRelevance: { score, classification: 'Supported', explanation: '', evidenceRefs: [] },
      constraintCompliance: { score, classification: 'Supported', explanation: '', evidenceRefs: [] },
      evidenceCompleteness: { score, classification: 'Supported', explanation: '', evidenceRefs: [] }
    },
    decision: { status: 'supported', score, explanation: 'Mock decision' },
    evidenceStatus: 'supported',
    retrievedAt: new Date().toISOString()
  };
}

function createMockEnvelope(params: {
  name: string;
  id: string;
  score: number;
  tags?: string[];
  signals?: Array<{
    signalType: 'cultural_tag' | 'taste_affinity';
    relatedEntityName?: string;
    relatedEntityId?: string;
    value?: number;
    tags?: string[];
  }>;
  status?: 'resolved' | 'ambiguous' | 'unresolved';
}): ItemResolutionEnvelope {
  const audit = createMockItemAudit(params.score);
  audit.itemName = params.name;
  audit.itemId = params.id;

  const evidence: NormalizedEvidenceResult = {
    status: params.status === 'resolved' ? 'supported' : 'insufficient_evidence',
    entityId: params.id,
    entityName: params.name,
    signals: (params.signals || []).map(s => ({
      ...s,
      relationship: s.signalType === 'cultural_tag' ? 'direct_cultural_attribute' : 'high_taste_affinity'
    })),
    summary: { signalsCount: (params.signals || []).length, hasLocationSignal: false },
    provenance: {
      source: 'qloo',
      endpoint: '/entities',
      operation: 'test_evidence',
      correlationId: 'test_corr',
      retrievedAt: new Date().toISOString(),
      queryMetadata: {},
      classification: 'Supported'
    }
  };

  return {
    item: { id: params.id, name: params.name },
    resolution: {
      status: params.status || 'resolved',
      resolvedEntity: params.status === 'unresolved' ? undefined : {
        id: params.id,
        name: params.name,
        type: 'urn:entity:movie',
        tags: params.tags || [],
        confidence: 0.95,
        provenance: {
          source: 'qloo',
          endpoint: '/search',
          correlationId: 'test_corr',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      },
      confidence: 0.95,
      ambiguousCandidates: []
    },
    evidence,
    audit,
    initialAudit: audit
  };
}

describe('TasteAudit AI — Cultural Coverage & Blind Spot Intelligence Suite', () => {
  const coverageSvc = new CulturalCoverageService();

  // Test 1: 3 of 5 directions covered -> 60% coverage
  it('Test 1 — 3 / 5 covered produces exact deterministic 60% coverage', async () => {
    // 3 covered tags: Crime, Dark Comedy, Cult Film
    // 2 blind spots from Qloo insight cluster: Neo-Noir, Psychological Thriller
    const envs = [
      createMockEnvelope({
        name: 'Reservoir Dogs',
        id: 'ent_1',
        score: 89,
        tags: ['Crime', 'Cult Film'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          { signalType: 'cultural_tag', relatedEntityName: 'Cult Film' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Heat',
            relatedEntityId: 'ent_heat',
            value: 0.94,
            tags: ['Neo-Noir', 'Crime', 'Heist']
          },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Taxi Driver',
            relatedEntityId: 'ent_taxi',
            value: 0.92,
            tags: ['Psychological Thriller', 'Neo-Noir']
          }
        ]
      }),
      createMockEnvelope({
        name: 'Snatch',
        id: 'ent_2',
        score: 95,
        tags: ['Crime', 'Dark Comedy'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          { signalType: 'cultural_tag', relatedEntityName: 'Dark Comedy' }
        ]
      })
    ];

    const input: ParseStageInput = {
      rawRecommendation: '1. Reservoir Dogs\n2. Snatch',
      audienceContext: 'Fans of edgy crime films'
    };

    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('SUFFICIENT_EVIDENCE');
    expect(result.coveredDirections.length).toBeGreaterThanOrEqual(3);
    const coveredLabels = result.coveredDirections.map(d => d.label);
    expect(coveredLabels).toContain('Crime');
    expect(coveredLabels).toContain('Dark Comedy');
    expect(coveredLabels).toContain('Cult Film');

    const blindSpotLabels = result.blindSpots.map(d => d.label);
    expect(blindSpotLabels).toContain('Neo Noir');
    expect(blindSpotLabels).toContain('Psychological Thriller');

    // Total supported = covered + blindSpots
    expect(result.totalSupportedDirections).toBe(result.coveredDirectionsCount + result.blindSpotsCount);
    expect(result.coverageRatio).toBe(Number((result.coveredDirectionsCount / result.totalSupportedDirections).toFixed(3)));
    expect(result.coveragePercentage).toBe(Math.round(result.coverageRatio! * 100));
  });

  // Test 2: 100% coverage when all cluster directions are covered
  it('Test 2 — 100% coverage when all cluster directions are represented', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Film A',
        id: 'ent_a',
        score: 90,
        tags: ['Crime', 'Noir'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          { signalType: 'cultural_tag', relatedEntityName: 'Noir' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Film B',
            relatedEntityId: 'ent_b',
            value: 0.91,
            tags: ['Crime', 'Noir']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Film A' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('SUFFICIENT_EVIDENCE');
    expect(result.blindSpotsCount).toBe(0);
    expect(result.coveragePercentage).toBe(100);
    expect(result.coverageRatio).toBe(1);
  });

  // Test 3: Insufficient evidence does NOT manufacture a fake percentage
  it('Test 3 — Insufficient evidence yields no fabricated percentage or ratio', async () => {
    const envs: ItemResolutionEnvelope[] = [];
    const input: ParseStageInput = { rawRecommendation: 'Unknown mystery item' };

    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.coverageRatio).toBeUndefined();
    expect(result.coveragePercentage).toBeUndefined();
    expect(result.totalSupportedDirections).toBe(0);
    expect(result.summaryNote).toContain('Not enough Qloo-grounded cultural directions');
  });

  // Test 4: Zero supported cultural directions yields INSUFFICIENT_EVIDENCE, not misleading 0%
  it('Test 4 — Zero supported cultural directions yields INSUFFICIENT_EVIDENCE, never misleading 0%', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Generic Place',
        id: 'ent_gen',
        score: 50,
        tags: ['Dog', 'broken windshield'], // both filtered out by noise filter
        signals: []
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Generic Place' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.coverageRatio).toBeUndefined();
    expect(result.coveragePercentage).toBeUndefined();
  });

  // Test 5: Qloo-supported relevant direction absent from recommendations becomes BLIND_SPOT
  it('Test 5 — Qloo-supported direction absent from recommendations is categorized as BLIND_SPOT', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Film 1',
        id: 'ent_1',
        score: 90,
        tags: ['Action'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Action' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Connected Film',
            relatedEntityId: 'ent_conn',
            value: 0.95,
            tags: ['Neo-Noir', 'Psychological Thriller']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Film 1' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    const blindSpotLabels = result.blindSpots.map(b => b.label);
    expect(blindSpotLabels).toContain('Neo Noir');
    const neoNoirSpot = result.blindSpots.find(b => b.label === 'Neo Noir');
    expect(neoNoirSpot?.status).toBe('BLIND_SPOT');
    expect(neoNoirSpot?.evidenceRefs.length).toBeGreaterThan(0);
    expect(neoNoirSpot?.explanation).toContain('none of the submitted recommendations meaningfully represent this direction');
  });

  // Test 6: Direction represented by candidate becomes COVERED with candidate reference
  it('Test 6 — Direction represented by candidate is categorized as COVERED with candidate reference', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Reservoir Dogs',
        id: 'ent_1',
        score: 89,
        tags: ['Crime', 'Nonlinear Storytelling'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          { signalType: 'cultural_tag', relatedEntityName: 'Nonlinear Storytelling' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Heat',
            relatedEntityId: 'ent_heat',
            value: 0.92,
            tags: ['Heist']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Reservoir Dogs' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    const crimeDir = result.coveredDirections.find(d => d.label === 'Crime');
    expect(crimeDir).toBeDefined();
    expect(crimeDir?.status).toBe('COVERED');
    expect(crimeDir?.representedBy).toContain('Reservoir Dogs');
    expect(crimeDir?.explanation).toContain('Reservoir Dogs');
  });

  // Test 7: Maximum 3 blind spots displayed
  it('Test 7 — Blind spots are capped at a maximum of 3 strongest evidence-backed directions', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Film 1',
        id: 'ent_1',
        score: 90,
        tags: ['Crime'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Film 2',
            relatedEntityId: 'ent_2',
            value: 0.95,
            tags: ['Neo-Noir', 'Psychological Thriller', 'Heist', 'French New Wave', 'Cyberpunk', 'Gothic Cinema']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Film 1' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.blindSpots.length).toBeLessThanOrEqual(3);
  });

  // Test 8: Qloo-grounded alternative addresses the top blind spot
  it('Test 8 — Qloo-grounded alternative addresses the top blind spot with empirical affinity', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Reservoir Dogs',
        id: 'ent_1',
        score: 89,
        tags: ['Crime'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Heat',
            relatedEntityId: 'ent_heat',
            value: 0.945,
            tags: ['Neo-Noir', 'Crime', 'Heist']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Reservoir Dogs' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.alternative).toBeDefined();
    expect(result.alternative?.name).toBe('Heat');
    expect(result.alternative?.entityId).toBe('ent_heat');
    expect(result.alternative?.affinity).toBe(0.945);
    expect(result.alternative?.uncoveredDirection).toBe(result.blindSpots[0].label);
    expect(result.alternative?.rationale).toContain('Heat');
  });

  // Test 9: Failure Isolation — Orchestrator catches coverage errors and preserves audit score unchanged
  it('Test 9 — Failure Isolation: coverage service failure preserves 93/100 audit score and returns UNAVAILABLE', async () => {
    const failingCoverageSvc = {
      analyzeCoverage: vi.fn().mockRejectedValue(new Error('Qloo coverage timeout'))
    } as unknown as CulturalCoverageService;

    const mockResolutionSvc = {
      resolve: vi.fn().mockResolvedValue({
        status: 'resolved',
        resolvedEntity: { id: 'ent_mock', name: 'Mock Item', type: 'urn:entity:movie', tags: ['Crime'], confidence: 0.95 }
      })
    } as any;

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [{ signalType: 'cultural_tag', relatedEntityName: 'Crime' }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { source: 'qloo', endpoint: '/entities', operation: 'test', correlationId: 'c1', retrievedAt: new Date().toISOString(), queryMetadata: {}, classification: 'Supported' }
      })
    } as any;

    const orchestrator = new TasteAuditOrchestrator(
      mockResolutionSvc,
      mockEvidenceSvc,
      undefined,
      undefined,
      undefined
    );
    // Inject failing coverage service
    (orchestrator as unknown as { coverageSvc: CulturalCoverageService }).coverageSvc = failingCoverageSvc;

    const mockInput: ParseStageInput = {
      rawRecommendation: '1. Reservoir Dogs\n2. Snatch\n3. Fargo',
      audienceContext: 'Young adults who enjoy edgy crime films',
      location: 'Los Angeles, USA',
      constraints: ['Crime', 'dark humor', 'entertaining']
    };

    // Even if coverage throws, executePipeline MUST NOT throw
    const pipelineResult = await orchestrator.executePipeline(mockInput, { enableAgent: false });

    expect(pipelineResult).toBeDefined();
    expect(pipelineResult.auditReport?.overallScore).toBeDefined();
    expect(pipelineResult.culturalCoverage).toBeDefined();
    expect(pipelineResult.culturalCoverage?.status).toBe('UNAVAILABLE');
    expect(pipelineResult.culturalCoverage?.summaryNote).toContain('Cultural coverage unavailable — the verified audit result above remains valid.');
  });

  // Test 10: Cross-Domain — Music Case (Radiohead taste cluster)
  it('Test 10 — Cross-Domain: Music case derives music directions without movie assumptions', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Thom Yorke',
        id: 'ent_thom',
        score: 92,
        tags: ['Alternative Rock', 'Electronic', 'Experimental'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Alternative Rock' },
          { signalType: 'cultural_tag', relatedEntityName: 'Electronic' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Arcade Fire',
            relatedEntityId: 'ent_arcade',
            value: 0.94,
            tags: ['Neo-Psychedelia', 'Indie Rock', 'Baroque Pop']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Thom Yorke' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('SUFFICIENT_EVIDENCE');
    const allLabels = [...result.coveredDirections, ...result.blindSpots].map(d => d.label);
    expect(allLabels).toContain('Alternative Rock');
    expect(allLabels).toContain('Electronic');
    // Ensure no movie artifacts leak into music
    expect(allLabels).not.toContain('Crime');
    expect(allLabels).not.toContain('Neo Noir');
  });

  // Test 11: Cross-Domain — Dining Case (Specialty coffee & dining)
  it('Test 11 — Cross-Domain: Dining case derives dining directions cleanly', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Dishoom',
        id: 'ent_dishoom',
        score: 88,
        tags: ['Authentic', 'Coffee And Tea', 'Casual Dining'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Authentic' },
          { signalType: 'cultural_tag', relatedEntityName: 'Coffee And Tea' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Caravan',
            relatedEntityId: 'ent_caravan',
            value: 0.96,
            tags: ['Global Fusion', 'Vegetarian Meals', 'Neighborhood Buzz']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Dishoom' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    expect(result.status).toBe('SUFFICIENT_EVIDENCE');
    const allLabels = [...result.coveredDirections, ...result.blindSpots].map(d => d.label);
    expect(allLabels).toContain('Coffee And Tea');
    expect(allLabels).toContain('Authentic');
    // Ensure no film or music leaks
    expect(allLabels).not.toContain('Alternative Rock');
    expect(allLabels).not.toContain('Crime');
  });

  // Test 12: Noise filtering rejects administrative/physical non-cultural tags
  it('Test 12 — Noise filtering removes administrative phrases (masks, wheelchair, etc.)', async () => {
    const envs = [
      createMockEnvelope({
        name: 'Venue X',
        id: 'ent_x',
        score: 85,
        tags: ['Staff wear masks', 'Wheelchair accessible', 'Live Jazz', 'Indie'],
        signals: [
          { signalType: 'cultural_tag', relatedEntityName: 'Live Jazz' },
          { signalType: 'cultural_tag', relatedEntityName: 'Indie' },
          {
            signalType: 'taste_affinity',
            relatedEntityName: 'Venue Y',
            relatedEntityId: 'ent_y',
            value: 0.90,
            tags: ['Credit card accepted', 'Free parking', 'Acoustic Sessions']
          }
        ]
      })
    ];

    const input: ParseStageInput = { rawRecommendation: 'Venue X' };
    const result = await coverageSvc.analyzeCoverage(input, envs);

    const allLabels = [...result.coveredDirections, ...result.blindSpots].map(d => d.label.toLowerCase());
    expect(allLabels).toContain('live jazz');
    expect(allLabels).toContain('indie');
    expect(allLabels).not.toContain('staff wear masks');
    expect(allLabels).not.toContain('wheelchair accessible');
    expect(allLabels).not.toContain('credit card accepted');
    expect(allLabels).not.toContain('free parking');
  });

  // -------------------------------------------------------------
  // Semantic Quality Hardening Regression Suite (12 Requirements)
  // -------------------------------------------------------------
  describe('Semantic Quality Hardening — Cultural Directions Integrity', () => {
    // 1. Meaningful cultural direction is accepted
    it('Task 7.1 — Meaningful cultural direction is accepted', () => {
      expect(isQualityCulturalTag('Crime')).toBe(true);
      expect(isQualityCulturalTag('Dark Comedy')).toBe(true);
      expect(isQualityCulturalTag('Neo-Noir')).toBe(true);
      expect(isQualityCulturalTag('Character Driven')).toBe(true);
      expect(isQualityCulturalTag('Specialty Coffee')).toBe(true);
      expect(isQualityCulturalTag('Alternative Rock')).toBe(true);
      expect(isQualityCulturalTag('Social Commentary')).toBe(true);
    });

    // 2. Physical/object-level tag is rejected
    it('Task 7.2 — Physical/object-level props and hardware are rejected', () => {
      expect(isQualityCulturalTag('Diamond')).toBe(false);
      expect(isQualityCulturalTag('Telephone')).toBe(false);
      expect(isQualityCulturalTag('Suitcase')).toBe(false);
      expect(isQualityCulturalTag('Car Trunk')).toBe(false);
      expect(isQualityCulturalTag('Gun')).toBe(false);
      expect(isQualityCulturalTag('Chair')).toBe(false);
      expect(isQualityCulturalTag('Mousetrap')).toBe(false);
      expect(isQualityCulturalTag('Two Way Mirror')).toBe(false);
    });

    // 3. Literal plot-mechanic tag is rejected
    it('Task 7.3 — Literal plot mechanics and physical bodily actions are rejected', () => {
      expect(isQualityCulturalTag('Stuffed in a car trunk')).toBe(false);
      expect(isQualityCulturalTag('Chased through a building')).toBe(false);
      expect(isQualityCulturalTag('Camera shot of a mans bare feet')).toBe(false);
      expect(isQualityCulturalTag('Tied to a chair')).toBe(false);
      expect(isQualityCulturalTag('Close up of mouth')).toBe(false);
      expect(isQualityCulturalTag('Walking in the rain')).toBe(false);
    });

    // 4. Entity/person name is rejected as a direction
    it('Task 7.4 — Person and entity names are rejected as directions', () => {
      expect(isQualityCulturalTag('Christina Aguilera')).toBe(false);
      expect(isQualityCulturalTag('Quentin Tarantino')).toBe(false);
      expect(isQualityCulturalTag('Mel Brooks')).toBe(false);
      expect(isQualityCulturalTag('Tom Waits')).toBe(false);
      expect(isQualityCulturalTag('Candidate Title', { knownEntityNames: new Set(['candidate title']) })).toBe(false);
    });

    // 5. Administrative/operational noise remains rejected
    it('Task 7.5 — Administrative/operational noise remains rejected', () => {
      expect(isQualityCulturalTag('Staff wear masks')).toBe(false);
      expect(isQualityCulturalTag('Wheelchair accessible')).toBe(false);
      expect(isQualityCulturalTag('Credit card accepted')).toBe(false);
      expect(isQualityCulturalTag('Two word title')).toBe(false);
    });

    // 6. Meaningful blind spot remains eligible
    it('Task 7.6 — Meaningful blind spot remains eligible when supported by Qloo', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.95,
              tags: ['Social Commentary', 'Dialogue Driven', 'Classic Cinema']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      const blindSpotLabels = res.blindSpots.map(b => b.label);
      expect(blindSpotLabels).toContain('Social Commentary');
      expect(blindSpotLabels).toContain('Dialogue Driven');
      expect(blindSpotLabels).toContain('Classic Cinema');
    });

    // 7. Rejected tag cannot become a blind spot
    it('Task 7.7 — A rejected tag (e.g. Mousetrap, Telephone, Diamond) cannot become a blind spot', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.95,
              tags: ['Mousetrap', 'Telephone', 'Diamond', 'Stuffed in a car trunk', 'Social Commentary']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      const blindSpotLabels = res.blindSpots.map(b => b.label);
      expect(blindSpotLabels).not.toContain('Mousetrap');
      expect(blindSpotLabels).not.toContain('Telephone');
      expect(blindSpotLabels).not.toContain('Diamond');
      expect(blindSpotLabels).not.toContain('Stuffed In A Car Trunk');
      expect(blindSpotLabels).toContain('Social Commentary');
    });

    // 8. Coverage percentage remains deterministic after filtering
    it('Task 7.8 — Coverage percentage remains deterministic after semantic filtering', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime', 'Dark Comedy'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            { signalType: 'cultural_tag', relatedEntityName: 'Dark Comedy' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.95,
              tags: ['Social Commentary', 'Diamond', 'Telephone']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      expect(res.status).toBe('SUFFICIENT_EVIDENCE');
      expect(res.coveredDirectionsCount).toBe(2);
      expect(res.blindSpotsCount).toBe(1);
      expect(res.totalSupportedDirections).toBe(3);
      expect(res.coveragePercentage).toBe(67);
    });

    // 9. Insufficient evidence returned when filtering removes all meaningful directions
    it('Task 7.9 — Insufficient evidence returned when filtering removes non-cultural tags leaving < 2 directions', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 80,
          tags: ['Telephone'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Diamond' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.95,
              tags: ['Mousetrap', 'Stuffed in a car trunk']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      expect(res.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(res.coveragePercentage).toBeUndefined();
      expect(res.coverageRatio).toBeUndefined();
      expect(res.coveredDirections).toHaveLength(0);
      expect(res.blindSpots).toHaveLength(0);
    });

    // 10. Qloo provenance remains mandatory
    it('Task 7.10 — Qloo provenance remains mandatory on all accepted directions', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.95,
              tags: ['Psychological Thriller']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      for (const cov of res.coveredDirections) {
        expect(cov.evidenceRefs.length).toBeGreaterThan(0);
      }
      for (const bld of res.blindSpots) {
        expect(bld.evidenceRefs.length).toBeGreaterThan(0);
      }
    });

    // 11. Existing Qloo-grounded alternative behavior still works
    it('Task 7.11 — Qloo-grounded alternative addresses a semantically valid blind spot', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Alternative Movie',
              relatedEntityId: 'ent_alt',
              value: 0.95,
              tags: ['Social Commentary']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      expect(res.alternative).toBeDefined();
      expect(res.alternative?.name).toBe('Alternative Movie');
      expect(res.alternative?.uncoveredDirection).toBe('Social Commentary');
      expect(res.alternative?.affinity).toBe(0.95);
    });

    // 12. Cross-domain behavior still works
    it('Task 7.12 — Cross-domain semantic quality works across movies, music, and dining', () => {
      expect(isQualityCulturalTag('Film Noir')).toBe(true);
      expect(isQualityCulturalTag('Black Comedy')).toBe(true);
      expect(isQualityCulturalTag('Post-Punk')).toBe(true);
      expect(isQualityCulturalTag('Synthpop')).toBe(true);
      expect(isQualityCulturalTag('Specialty Coffee')).toBe(true);
      expect(isQualityCulturalTag('Casual Dining')).toBe(true);
      expect(isQualityCulturalTag('Craft Beer')).toBe(true);
    });

    // 13. Occupational / character-role compound descriptors are rejected (Task 2)
    it('Task 7.13 — Occupational and character-role compound descriptors are rejected', () => {
      expect(isQualityCulturalTag('Italian American Policeman')).toBe(false);
      expect(isQualityCulturalTag('Irish American Priest')).toBe(false);
      expect(isQualityCulturalTag('Delivery Boy')).toBe(false);
      expect(isQualityCulturalTag('Corrupt Lawyer')).toBe(false);
      expect(isQualityCulturalTag('Television Host')).toBe(false);
      expect(isQualityCulturalTag('Television Producer')).toBe(false);
      expect(isQualityCulturalTag('Stand Up Comedian')).toBe(false);
      // But meaningful cultural identities remain eligible
      expect(isQualityCulturalTag('Italian American')).toBe(true);
      expect(isQualityCulturalTag('Stand Up Comedy')).toBe(true);
    });

    // 14. Technical production and industry metadata are rejected (Task 3)
    it('Task 7.14 — Technical production details and industry metadata are rejected', () => {
      expect(isQualityCulturalTag('Electronic Music Score')).toBe(false);
      expect(isQualityCulturalTag('Film Criticism')).toBe(false);
      expect(isQualityCulturalTag('Music Score Detail')).toBe(false);
      expect(isQualityCulturalTag('Camera Technique')).toBe(false);
      expect(isQualityCulturalTag('Editing Style')).toBe(false);
      // But broader recognizable cultural categories remain eligible
      expect(isQualityCulturalTag('Electronic Music')).toBe(true);
      expect(isQualityCulturalTag('Film Noir')).toBe(true);
    });

    // 15. High Qloo relevance + poor semantic quality does NOT create a blind spot (Task 4)
    it('Task 7.15 — High Qloo relevance + poor semantic quality does not create a blind spot', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Film B',
              relatedEntityId: 'ent_b',
              value: 0.99,
              tags: ['Italian American Policeman', 'Electronic Music Score', 'Film Criticism', 'Classic Cinema']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      const blindSpotLabels = res.blindSpots.map(b => b.label);
      expect(blindSpotLabels).not.toContain('Italian American Policeman');
      expect(blindSpotLabels).not.toContain('Electronic Music Score');
      expect(blindSpotLabels).not.toContain('Film Criticism');
      expect(blindSpotLabels).toContain('Classic Cinema');
    });

    // 16. Alternative selection skips semantically weak blind spots (Task 5)
    it('Task 7.16 — Alternative selection targets semantically valid blind spots and skips weak tags', async () => {
      const envs = [
        createMockEnvelope({
          name: 'Film A',
          id: 'ent_a',
          score: 90,
          tags: ['Crime'],
          signals: [
            { signalType: 'cultural_tag', relatedEntityName: 'Crime' },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Connected Film 1',
              relatedEntityId: 'ent_conn_1',
              value: 0.99,
              tags: ['Electronic Music Score']
            },
            {
              signalType: 'taste_affinity',
              relatedEntityName: 'Connected Film 2',
              relatedEntityId: 'ent_conn_2',
              value: 0.94,
              tags: ['Social Commentary']
            }
          ]
        })
      ];

      const input: ParseStageInput = { rawRecommendation: 'Film A' };
      const res = await coverageSvc.analyzeCoverage(input, envs);

      expect(res.alternative).toBeDefined();
      expect(res.alternative?.uncoveredDirection).toBe('Social Commentary');
      expect(res.alternative?.name).toBe('Connected Film 2');
    });
  });
});

