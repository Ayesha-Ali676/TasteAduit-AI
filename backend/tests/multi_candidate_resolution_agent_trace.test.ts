import { describe, it, expect, vi } from 'vitest';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { normalizeCandidateSearch } from '../src/services/resolution/candidate.normalizer.js';
import { RecommendationParser } from '../src/services/orchestrator/parser.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { NormalizedCandidate } from '../src/services/qloo/qloo.types.js';
import { ItemResolutionEnvelope } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult } from '../src/services/audit/audit.types.js';

function createMockItemAudit(
  id: string,
  name: string,
  score: number,
  status: 'supported' | 'inferred' | 'insufficient_evidence'
): ItemAuditResult {
  return {
    itemId: id,
    itemName: name,
    overallScore: score,
    dimensions: {
      culturalAlignment: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test explanation', evidenceRefs: [] },
      contextualRelevance: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test explanation', evidenceRefs: [] },
      constraintCompliance: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test explanation', evidenceRefs: [] },
      evidenceCompleteness: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test explanation', evidenceRefs: [] }
    },
    decision: { status, score, explanation: 'Mock decision' },
    evidenceStatus: status === 'supported' ? 'supported' : status === 'inferred' ? 'inferred' : 'insufficient_evidence',
    retrievedAt: new Date().toISOString()
  };
}

describe('TasteAudit AI — Multi-Candidate Qloo Resolution + Agent Trace Hardening Suite', () => {
  const auditEngine = new CulturalGroundingAuditEngine();

  // -------------------------------------------------------------------------
  // PART 1: RESTAURANT CANDIDATE RESOLUTION TESTS (1 - 10)
  // -------------------------------------------------------------------------

  // Test 1: Waqar Restaurant – Madina Chowk resolution
  it('Test 1 — Waqar Restaurant – Madina Chowk: generates controlled search variants and resolves base place entity', async () => {
    const norm = normalizeCandidateSearch('Waqar Restaurant – Madina Chowk');
    expect(norm.originalName).toBe('Waqar Restaurant – Madina Chowk');
    expect(norm.normalizedName).toBe('Waqar Restaurant');
    expect(norm.extractedLocation).toBe('Madina Chowk');
    expect(norm.inferredCategory).toBe('dining');
    expect(norm.candidateSearchNames).toContain('Waqar Restaurant');
    expect(norm.candidateSearchNames).toContain('Waqar');

    const mockQlooClient = {
      searchCandidates: vi.fn().mockImplementation(async (query: string) => {
        if (query === 'Waqar Restaurant' || query === 'Waqar') {
          return [
            {
              id: 'ent_waqar_1',
              name: 'Waqar Restaurant',
              type: 'urn:entity:place',
              category: 'entity',
              disambiguation: 'Traditional Pakistani family restaurant, Madina Chowk, Faisalabad',
              tags: ['restaurant', 'pakistani', 'dining'],
              source: 'qloo',
              retrievedAt: new Date().toISOString()
            } as NormalizedCandidate
          ];
        }
        return [];
      })
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Waqar Restaurant – Madina Chowk', {
      location: 'Ghulam Muhammad Abad, Faisalabad'
    });

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.id).toBe('ent_waqar_1');
    expect(result.resolvedEntity?.name).toBe('Waqar Restaurant');
    expect(result.derivedConfidence).toBeGreaterThanOrEqual(0.70);
  });

  // Test 2: Baba Fareed Hotel & Barbeque resolution
  it('Test 2 — Baba Fareed Hotel & Barbeque: safely handles & vs and and Barbeque spelling variants', async () => {
    const norm = normalizeCandidateSearch('Baba Fareed Hotel & Barbeque');
    expect(norm.candidateSearchNames).toContain('Baba Fareed Hotel & Barbeque');
    expect(norm.candidateSearchNames).toContain('Baba Fareed Hotel and Barbeque');
    expect(norm.candidateSearchNames).toContain('Baba Fareed Hotel & Barbecue');
    expect(norm.candidateSearchNames).toContain('Baba Fareed');

    const mockQlooClient = {
      searchCandidates: vi.fn().mockImplementation(async (query: string) => {
        if (query === 'Baba Fareed Hotel and Barbeque' || query === 'Baba Fareed') {
          return [
            {
              id: 'ent_baba_1',
              name: 'Baba Fareed Hotel & Barbecue',
              type: 'urn:entity:place',
              category: 'entity',
              tags: ['restaurant', 'barbecue', 'dining'],
              source: 'qloo',
              retrievedAt: new Date().toISOString()
            } as NormalizedCandidate
          ];
        }
        return [];
      })
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Baba Fareed Hotel & Barbeque');

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.id).toBe('ent_baba_1');
    expect(result.derivedConfidence).toBeGreaterThanOrEqual(0.70);
  });

  // Test 3: Punctuation variation
  it('Test 3 — Punctuation variation: handles decorative quotes, trailing punctuation, and repeated spaces', () => {
    const norm1 = normalizeCandidateSearch('  "Waqar Restaurant"  ');
    expect(norm1.normalizedName).toBe('Waqar Restaurant');
    expect(norm1.candidateSearchNames[0]).toBe('Waqar Restaurant');

    const norm2 = normalizeCandidateSearch('Baba Fareed Hotel & Barbeque, :');
    expect(norm2.normalizedName).toBe('Baba Fareed Hotel & Barbeque');

    const norm3 = normalizeCandidateSearch('Farzand   Foods   Centre');
    expect(norm3.normalizedName).toBe('Farzand Foods Centre');
  });

  // Test 4: Hyphen / En-dash / Em-dash variation
  it('Test 4 — Hyphen/en-dash variation: standardizes ASCII hyphen, en-dash, and em-dash seamlessly', () => {
    const n1 = normalizeCandidateSearch('Waqar Restaurant - Madina Chowk');
    const n2 = normalizeCandidateSearch('Waqar Restaurant – Madina Chowk');
    const n3 = normalizeCandidateSearch('Waqar Restaurant — Madina Chowk');

    expect(n1.extractedLocation).toBe('Madina Chowk');
    expect(n2.extractedLocation).toBe('Madina Chowk');
    expect(n3.extractedLocation).toBe('Madina Chowk');
    expect(n1.normalizedName).toBe('Waqar Restaurant');
    expect(n2.normalizedName).toBe('Waqar Restaurant');
    expect(n3.normalizedName).toBe('Waqar Restaurant');
  });

  // Test 5: Restaurant name + location suffix handling
  it('Test 5 — Restaurant name + location suffix: preserves location context without corrupting canonical entity name', async () => {
    const norm = normalizeCandidateSearch('Dishoom (Covent Garden)');
    expect(norm.normalizedName).toBe('Dishoom');
    expect(norm.extractedLocation).toBe('Covent Garden');
    expect(norm.candidateSearchNames).toContain('Dishoom');

    const mockQlooClient = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          id: 'ent_dishoom_1',
          name: 'Dishoom',
          type: 'urn:entity:place',
          category: 'entity',
          disambiguation: 'Bombay comfort food in Covent Garden, London',
          tags: ['restaurant', 'indian'],
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        }
      ])
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Dishoom (Covent Garden)', { location: 'London, UK' });

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.name).toBe('Dishoom'); // Canonical entity without parenthetical
    expect(result.derivedConfidence).toBeGreaterThanOrEqual(0.80);
  });

  // Test 6: Multiple Qloo candidates ranking
  it('Test 6 — Multiple Qloo candidates: deterministically ranks dining match with location over generic match', async () => {
    const mockQlooClient = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          id: 'ent_generic_1',
          name: 'Waqar',
          type: 'urn:entity:place',
          category: 'entity',
          disambiguation: 'Tea stall in Lahore',
          tags: ['tea', 'cafe'],
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        },
        {
          id: 'ent_target_1',
          name: 'Waqar Restaurant',
          type: 'urn:entity:place',
          category: 'entity',
          disambiguation: 'Family dining in Faisalabad, Madina Chowk',
          tags: ['restaurant', 'pakistani'],
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        }
      ])
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Waqar Restaurant – Madina Chowk', {
      location: 'Faisalabad, Pakistan'
    });

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.id).toBe('ent_target_1');
    expect(result.resolvedEntity?.name).toBe('Waqar Restaurant');
  });

  // Test 7: Incompatible Qloo entity type rejected by Candidate Compatibility Firewall
  it('Test 7 — Incompatible Qloo entity type: rejects movie or album entities when resolving dining candidate', async () => {
    const mockQlooClient = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          id: 'ent_movie_1',
          name: 'Waqar',
          type: 'urn:entity:movie',
          category: 'entity',
          disambiguation: 'Action feature film',
          tags: ['cinema', 'film'],
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        }
      ])
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Waqar Restaurant', {
      categoryHint: 'dining'
    });

    // Incompatible type must NOT resolve as a dining match
    expect(result.status).toBe('unresolved');
    expect(result.resolvedEntity).toBeUndefined();
  });

  // Test 8: No Qloo match -> honest UNVERIFIED
  it('Test 8 — No Qloo match: returns UNVERIFIED honestly without fabricating Qloo IDs or evidence', async () => {
    const mockQlooClient = {
      searchCandidates: vi.fn().mockResolvedValue([])
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Nonexistent Mystery Eatery 99999');

    expect(result.status).toBe('unresolved');
    expect(result.candidates).toHaveLength(0);
    expect(result.resolvedEntity).toBeUndefined();
    expect(result.provenance.classification).toBe('Unverified');
  });

  // Test 9: Existing Mr Roll & Miss Biryani regression
  it('Test 9 — Existing Mr Roll & Miss Biryani: continues resolving cleanly with ampersand variants', async () => {
    const norm = normalizeCandidateSearch('Mr Roll & Miss Biryani');
    expect(norm.candidateSearchNames).toContain('Mr Roll & Miss Biryani');
    expect(norm.candidateSearchNames).toContain('Mr Roll and Miss Biryani');

    const mockQlooClient = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          id: 'ent_mrroll_1',
          name: 'Mr Roll & Miss Biryani',
          type: 'urn:entity:place',
          category: 'entity',
          tags: ['restaurant', 'biryani', 'fast food'],
          source: 'qloo',
          retrievedAt: new Date().toISOString()
        }
      ])
    };

    const resolutionSvc = new EntityResolutionService(mockQlooClient as any);
    const result = await resolutionSvc.resolve('Mr Roll & Miss Biryani');

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.id).toBe('ent_mrroll_1');
  });

  // Test 10: Non-dining candidate regression
  it('Test 10 — Non-dining candidate regression: does not force dining domain on music or movies', () => {
    const p1 = normalizeCandidateSearch('Pulp Fiction');
    expect(p1.inferredCategory).toBeUndefined();
    expect(p1.candidateSearchNames).toEqual(['Pulp Fiction']);

    const p2 = normalizeCandidateSearch('Radiohead');
    expect(p2.inferredCategory).toBeUndefined();
    expect(p2.candidateSearchNames).toEqual(['Radiohead']);
  });

  // -------------------------------------------------------------------------
  // PART 2: AGENT TRACE & PROVIDER FAILURE HARDENING TESTS (11 - 18)
  // -------------------------------------------------------------------------

  // Test 11: Provider failure produces one clean terminal failure
  it('Test 11 — Provider failure: produces exactly one clean terminal failure step without fake intermediate steps', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: false,
        error: 'Groq API rate limit (429); OpenRouter timeout',
        providerUsed: 'openrouter'
      }),
      executeRepair: vi.fn(),
      executeEntityResolution: vi.fn(),
      getHealth: vi.fn()
    } as unknown as AIOrchestratorProvider;

    const mockRepairSvc = {
      repairItem: vi.fn(),
      aggregateRepairReport: vi.fn(),
      shouldRepair: vi.fn().mockReturnValue(true),
      getVerifiedCandidates: vi.fn().mockResolvedValue([])
    };

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: mockRepairSvc as any,
      evidenceSvc: { retrieveEvidence: vi.fn() } as any,
      resolutionSvc: { resolve: vi.fn() } as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Test Venue' },
        resolution: { query: 'Test Venue', status: 'resolved', candidates: [], derivedConfidence: 0.8, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Test Venue', 60, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Test Venue' }
    );

    const result = await agentLoop.runLoop(
      { rawRecommendation: 'Test Venue' },
      initialEnvelopes,
      initialReport,
      { maxIterations: 3 }
    );

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('provider_failure');
    // Exactly 1 trace event for the single failed attempt: no redundant intermediate STOPPED steps!
    expect(result.trace.events).toHaveLength(1);
    expect(result.trace.events[0].decision).toBe('STOP');
    expect(result.trace.events[0].stopReason).toBe('provider_failure');
    expect(result.trace.events[0].reasoning).toContain('AI Agent unavailable — deterministic Qloo audit preserved.');
  });

  // Test 12: Provider failure preserves deterministic score
  it('Test 12 — Provider failure: preserves deterministic audit score completely unchanged', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({ success: false, error: 'Connection timeout' })
    } as unknown as AIOrchestratorProvider;

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: { shouldRepair: vi.fn().mockReturnValue(true), getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Item A' },
        resolution: { query: 'Item A', status: 'resolved', candidates: [], derivedConfidence: 0.8, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Item A', 74, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Item A' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'Item A' }, initialEnvelopes, initialReport);

    expect(result.auditReport.overallScore).toBe(74);
    expect(result.trace.initialOverallScore).toBe(74);
    expect(result.trace.finalOverallScore).toBe(74);
    expect(result.trace.netScoreImprovement).toBe(0);
  });

  // Test 13: Successful repair -> score increases
  it('Test 13 — Successful repair: records REPAIR event and score increases (79 → 83)', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn()
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: 'it_1',
            suggestedCandidateId: 'ent_better_1',
            reasoning: 'Replaced with higher affinity alternative'
          })
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            decision: 'ACCEPT',
            reasoning: 'Now fully culturally grounded'
          })
        })
    } as unknown as AIOrchestratorProvider;

    const mockRepairSvc = {
      shouldRepair: vi.fn().mockReturnValue(true),
      aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] }),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'ent_better_1', name: 'Better Venue', type: 'urn:entity:place' }
      ]),
      repairItem: vi.fn().mockResolvedValue({
        status: 'repaired',
        selectedCandidate: { entityId: 'ent_better_1', name: 'Better Venue', type: 'urn:entity:place' },
        beforeAudit: createMockItemAudit('it_1', 'Original Venue', 79, 'inferred'),
        afterAudit: createMockItemAudit('it_1', 'Better Venue', 83, 'supported'),
        scoreDelta: 4,
        verifiedImprovement: true,
        evidenceRefs: ['ref_1'],
        repairedEnvelope: {
          item: { id: 'it_1', name: 'Better Venue' },
          resolution: { query: 'Better Venue', status: 'resolved', candidates: [], derivedConfidence: 0.9, provenance: {} as any },
          audit: createMockItemAudit('it_1', 'Better Venue', 83, 'supported')
        }
      })
    };

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: mockRepairSvc as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Original Venue', category: 'dining' },
        resolution: {
          query: 'Original Venue',
          status: 'resolved',
          resolvedEntity: { id: 'ent_orig_1', name: 'Original Venue', type: 'urn:entity:place', category: 'entity', source: 'qloo', retrievedAt: new Date().toISOString() },
          candidates: [],
          derivedConfidence: 0.8,
          provenance: { qlooType: 'urn:entity:place' } as any
        },
        audit: createMockItemAudit('it_1', 'Original Venue', 79, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Original Venue' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'Original Venue' }, initialEnvelopes, initialReport, { maxIterations: 2 });

    expect(result.trace.events.some(e => e.decision === 'REPAIR')).toBe(true);
    expect(result.trace.netScoreImprovement).toBe(4);
    expect(result.auditReport.overallScore).toBe(83);
  });

  // Test 14: No-improvement repair does not claim success
  it('Test 14 — No-improvement repair: does not claim false success when score delta is 0', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({
          decision: 'REPAIR',
          targetItemId: 'it_1',
          suggestedCandidateId: 'ent_same_1',
          reasoning: 'Attempt repair'
        })
      })
    } as unknown as AIOrchestratorProvider;

    const mockRepairSvc = {
      shouldRepair: vi.fn().mockReturnValue(true),
      aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] }),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'ent_same_1', name: 'Same Venue', type: 'urn:entity:place' }
      ]),
      repairItem: vi.fn().mockResolvedValue({
        status: 'repaired',
        selectedCandidate: { entityId: 'ent_same_1', name: 'Same Venue', type: 'urn:entity:place' },
        beforeAudit: createMockItemAudit('it_1', 'Original Venue', 79, 'inferred'),
        afterAudit: createMockItemAudit('it_1', 'Same Venue', 79, 'inferred'),
        scoreDelta: 0,
        verifiedImprovement: false,
        evidenceRefs: ['ref_1']
      })
    };

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: mockRepairSvc as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Original Venue', category: 'dining' },
        resolution: {
          query: 'Original Venue',
          status: 'resolved',
          resolvedEntity: { id: 'ent_orig_1', name: 'Original Venue', type: 'urn:entity:place', category: 'entity', source: 'qloo', retrievedAt: new Date().toISOString() },
          candidates: [],
          derivedConfidence: 0.8,
          provenance: { qlooType: 'urn:entity:place' } as any
        },
        audit: createMockItemAudit('it_1', 'Original Venue', 79, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Original Venue' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'Original Venue' }, initialEnvelopes, initialReport);

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('zero_improvement_repair_stop');
    expect(result.trace.netScoreImprovement).toBe(0);
    expect(result.trace.events[0].reasoning).toContain('no improvement');
  });

  // Test 15: Repeated provider failure does not create redundant trace entries
  it('Test 15 — Repeated provider failure: terminates on the first failure without looping', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: false,
        error: 'Network unreachable'
      })
    } as unknown as AIOrchestratorProvider;

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: { shouldRepair: vi.fn().mockReturnValue(true), getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Item A' },
        resolution: { query: 'Item A', status: 'resolved', candidates: [], derivedConfidence: 0.8, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Item A', 60, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Item A' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'Item A' }, initialEnvelopes, initialReport, { maxIterations: 5 });

    // Loop must terminate immediately on provider failure: 1 total event, exactly 1 call
    expect(mockAI.executeCompletion).toHaveBeenCalledTimes(1);
    expect(result.trace.events).toHaveLength(1);
  });

  // Test 16: Max-iteration bound still holds
  it('Test 16 — Max-iteration bound: never executes more than maxIterations', async () => {
    let callCount = 0;
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: `it_${callCount}`,
            suggestedCandidateId: `ent_cand_${callCount}`,
            reasoning: 'Keep repairing'
          })
        };
      })
    } as unknown as AIOrchestratorProvider;

    const mockRepairSvc = {
      shouldRepair: vi.fn().mockReturnValue(true),
      getVerifiedCandidates: vi.fn().mockImplementation(async (env: any) => [
        { entityId: `ent_cand_${callCount}`, name: 'Candidate', type: 'urn:entity:place' }
      ]),
      repairItem: vi.fn().mockImplementation(async (env: any) => ({
        status: 'repaired',
        selectedCandidate: { entityId: `ent_cand_${callCount}`, name: 'Candidate', type: 'urn:entity:place' },
        beforeAudit: createMockItemAudit('it_1', 'V', 60 + callCount, 'inferred'),
        afterAudit: createMockItemAudit('it_1', 'V', 61 + callCount, 'inferred'),
        scoreDelta: 1,
        verifiedImprovement: true,
        evidenceRefs: ['ref']
      }))
    };

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: mockRepairSvc as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'V' },
        resolution: { query: 'V', status: 'resolved', candidates: [], derivedConfidence: 0.8, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'V', 60, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'V' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'V' }, initialEnvelopes, initialReport, { maxIterations: 3 });

    expect(result.trace.totalIterations).toBeLessThanOrEqual(3);
  });

  // Test 17: Multi-candidate result survives provider failure
  it('Test 17 — Multi-candidate result: survives provider failure without corrupting candidate states or score', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: false,
        error: 'Groq timeout'
      })
    } as unknown as AIOrchestratorProvider;

    const envelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Candidate A' },
        resolution: { query: 'Candidate A', status: 'resolved', candidates: [], derivedConfidence: 0.9, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Candidate A', 85, 'supported')
      },
      {
        item: { id: 'it_2', name: 'Candidate B' },
        resolution: { query: 'Candidate B', status: 'unresolved', candidates: [], derivedConfidence: 0, provenance: {} as any },
        audit: createMockItemAudit('it_2', 'Candidate B', 0, 'insufficient_evidence')
      },
      {
        item: { id: 'it_3', name: 'Candidate C' },
        resolution: { query: 'Candidate C', status: 'resolved', candidates: [], derivedConfidence: 0.85, provenance: {} as any },
        audit: createMockItemAudit('it_3', 'Candidate C', 75, 'supported')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      envelopes.map(e => e.audit!),
      { rawRecommendation: 'Candidate A, B, C' }
    );

    // Initial deterministic score: average of verified candidates (85 + 75) / 2 = 80
    expect(initialReport.overallScore).toBe(80);
    expect(initialReport.verifiedItemsCount).toBe(2);

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: { shouldRepair: vi.fn().mockReturnValue(true), getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const result = await agentLoop.runLoop({ rawRecommendation: 'Candidate A, B, C' }, envelopes, initialReport);

    // Deterministic audit must survive provider failure intact:
    expect(result.auditReport.overallScore).toBe(80);
    expect(result.auditReport.verifiedItemsCount).toBe(2);
    expect(result.envelopes[0].resolution.status).toBe('resolved');
    expect(result.envelopes[1].resolution.status).toBe('unresolved');
    expect(result.envelopes[2].resolution.status).toBe('resolved');
    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('provider_failure');
  });

  // Test 18: Deterministic audit remains score authority
  it('Test 18 — Deterministic score authority: LLM decision cannot manufacture or alter the audit score', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: true,
        // Malicious or hallucinated decision trying to set an arbitrary score
        content: JSON.stringify({
          decision: 'STOP',
          reasoning: 'Stopping with fabricated score',
          score: 100
        })
      })
    } as unknown as AIOrchestratorProvider;

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: { shouldRepair: vi.fn().mockReturnValue(false) } as any,
      evidenceSvc: {} as any,
      resolutionSvc: {} as any,
      auditEngine
    });

    const envelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Item A' },
        resolution: { query: 'Item A', status: 'resolved', candidates: [], derivedConfidence: 0.9, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Item A', 68, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      envelopes.map(e => e.audit!),
      { rawRecommendation: 'Item A' }
    );

    const result = await agentLoop.runLoop({ rawRecommendation: 'Item A' }, envelopes, initialReport);

    // Final score must remain strictly what the deterministic audit engine calculated (68), not 100!
    expect(result.auditReport.overallScore).toBe(68);
    expect(result.trace.finalOverallScore).toBe(68);
  });
});
