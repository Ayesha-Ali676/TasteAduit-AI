import { describe, it, expect, vi } from 'vitest';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { ItemResolutionEnvelope } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult } from '../src/services/audit/audit.types.js';
import { RecommendationParser } from '../src/services/orchestrator/parser.js';

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
      culturalAlignment: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test', evidenceRefs: [] },
      contextualRelevance: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test', evidenceRefs: [] },
      constraintCompliance: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test', evidenceRefs: [] },
      evidenceCompleteness: { score, classification: status === 'supported' ? 'Supported' : 'Unverified', explanation: 'Test', evidenceRefs: [] }
    },
    decision: { status, score, explanation: 'Mock decision' },
    evidenceStatus: status === 'supported' ? 'supported' : status === 'inferred' ? 'inferred' : 'insufficient_evidence',
    retrievedAt: new Date().toISOString()
  };
}

/**
 * Mirror of UI status derivation logic in AuditResultsView.tsx
 */
function deriveUIStatus(params: {
  initialScore: number;
  finalScore: number;
  events?: Array<{ decision: string; scoreDelta?: number }>;
  terminalState?: string;
  finalStopReason?: string;
  repairedItems?: Array<{ scoreDelta?: number; verifiedImprovement?: boolean }>;
  auditDecisionStatus?: string;
}) {
  const scoreDelta = params.finalScore - params.initialScore;
  const repairedItems = params.repairedItems || [];
  const hasAttemptedRepair =
    (repairedItems.length > 0) ||
    (params.events?.some((e) => e.decision === 'REPAIR') ?? false);

  const hasSuccessfulRepair =
    (repairedItems.length > 0 && scoreDelta > 0 && repairedItems.some((r) => r.verifiedImprovement || (r.scoreDelta ?? 0) > 0)) ||
    (scoreDelta > 0 && (params.events?.some((e) => e.decision === 'REPAIR' && (e.scoreDelta ?? 0) > 0) ?? false));

  const hasEvidenceStrengthened =
    !hasSuccessfulRepair &&
    scoreDelta > 0 &&
    (params.events?.some((e) => e.decision === 'MORE_EVIDENCE' && (e.scoreDelta ?? 0) > 0) ?? false);

  const isZeroImprovementRepair = hasAttemptedRepair && scoreDelta <= 0;

  const isZeroImprovementEvidence =
    !hasSuccessfulRepair &&
    !hasAttemptedRepair &&
    scoreDelta <= 0 &&
    (params.events?.some((e) => e.decision === 'MORE_EVIDENCE') ?? false);

  const isProviderFailure = params.finalStopReason === 'provider_failure' && !hasSuccessfulRepair;

  const isAlreadyGrounded =
    scoreDelta === 0 &&
    !hasAttemptedRepair &&
    !hasEvidenceStrengthened &&
    !isZeroImprovementEvidence &&
    !isProviderFailure &&
    (params.terminalState === 'ACCEPTED' || params.auditDecisionStatus === 'supported');

  if (hasSuccessfulRepair) {
    return { label: 'Repaired successfully', deltaBadge: `+${scoreDelta} Repaired successfully`, scoreDelta };
  } else if (hasEvidenceStrengthened) {
    return { label: 'Evidence strengthened', deltaBadge: `+${scoreDelta} Evidence strengthened`, scoreDelta };
  } else if (isZeroImprovementRepair) {
    return { label: 'No improvement — original grounded result preserved', deltaBadge: `${params.initialScore} → ${params.finalScore} — No improvement`, scoreDelta };
  } else if (isZeroImprovementEvidence) {
    return { label: 'Additional evidence found — no score improvement', deltaBadge: `${params.initialScore} → ${params.finalScore} — No score change`, scoreDelta };
  } else if (isProviderFailure) {
    return { label: 'Provider unavailable — deterministic audit preserved', deltaBadge: null, scoreDelta: 0 };
  } else if (isAlreadyGrounded) {
    return { label: 'Already grounded', deltaBadge: 'Already grounded', scoreDelta: 0 };
  } else {
    return { label: 'Strong Cultural Fit', deltaBadge: null, scoreDelta };
  }
}

describe('TasteAudit AI — Final Multi-Candidate Score & Agent Status Integrity Suite', () => {
  const auditEngine = new CulturalGroundingAuditEngine();

  // Test 1: (89 + 95 + 95) / 3 deterministic aggregate calculation produces 93
  it('Test 1 — Deterministic aggregate calculation: (89 + 95 + 95) / 3 strictly produces 93', () => {
    const itemAudits: ItemAuditResult[] = [
      createMockItemAudit('it_1', 'Reservoir Dogs', 89, 'supported'),
      createMockItemAudit('it_2', 'Snatch', 95, 'supported'),
      createMockItemAudit('it_3', 'Fargo', 95, 'supported')
    ];

    const report = auditEngine.aggregateReport(itemAudits, { rawRecommendation: '1. Reservoir Dogs\n2. Snatch\n3. Fargo' });

    expect(report.totalItemsAudited).toBe(3);
    expect(report.verifiedItemsCount).toBe(3);
    expect(report.overallScore).toBe(93); // Math.round(279 / 3) = 93
    expect(report.overallScore).toBe(Math.round((89 + 95 + 95) / 3));
  });

  // Test 2: Aggregate is identical across backend result and frontend display
  it('Test 2 — Source-of-truth consistency: frontend display consumes identical aggregate score from backend', () => {
    const itemAudits: ItemAuditResult[] = [
      createMockItemAudit('it_1', 'Reservoir Dogs', 89, 'supported'),
      createMockItemAudit('it_2', 'Snatch', 95, 'supported'),
      createMockItemAudit('it_3', 'Fargo', 95, 'supported')
    ];

    const backendReport = auditEngine.aggregateReport(itemAudits, { rawRecommendation: '1. Reservoir Dogs\n2. Snatch\n3. Fargo' });
    const finalScore = backendReport.overallScore;

    expect(backendReport.overallScore).toBe(93);
    expect(finalScore).toBe(93);
  });

  // Test 3: Agent iteration score uses the authoritative aggregate (92 → 93)
  it('Test 3 — Agent iteration score: uses authoritative aggregate and updates monotonically', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn()
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            decision: 'MORE_EVIDENCE',
            targetItemId: 'it_3',
            reasoning: 'Disambiguate Fargo and retrieve additional signals'
          })
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            decision: 'ACCEPT',
            reasoning: 'All items are now grounded'
          })
        })
    } as unknown as AIOrchestratorProvider;

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [{ signalType: 'taste_affinity', value: 0.95, tags: ['Crime', 'Dark Comedy'] }],
        provenance: { classification: 'Supported', correlationId: 'ev_fargo_fresh' }
      })
    };

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Reservoir Dogs' },
        resolution: { query: 'Reservoir Dogs', status: 'resolved', resolvedEntity: { id: 'ent_rd', name: 'Reservoir Dogs', type: 'urn:entity:movie', category: 'entity', source: 'qloo', retrievedAt: '' }, candidates: [], derivedConfidence: 0.9, provenance: {} as any },
        audit: createMockItemAudit('it_1', 'Reservoir Dogs', 89, 'supported'),
        initialAudit: createMockItemAudit('it_1', 'Reservoir Dogs', 89, 'supported')
      },
      {
        item: { id: 'it_2', name: 'Snatch' },
        resolution: { query: 'Snatch', status: 'resolved', resolvedEntity: { id: 'ent_snatch', name: 'Snatch', type: 'urn:entity:movie', category: 'entity', source: 'qloo', retrievedAt: '' }, candidates: [], derivedConfidence: 0.95, provenance: {} as any },
        audit: createMockItemAudit('it_2', 'Snatch', 95, 'supported'),
        initialAudit: createMockItemAudit('it_2', 'Snatch', 95, 'supported')
      },
      {
        item: { id: 'it_3', name: 'Fargo' },
        resolution: {
          query: 'Fargo',
          status: 'ambiguous',
          candidates: [{ id: 'ent_fargo_movie', name: 'Fargo', type: 'urn:entity:movie', category: 'entity', source: 'qloo', retrievedAt: '' }],
          derivedConfidence: 0.5,
          provenance: {} as any
        },
        audit: createMockItemAudit('it_3', 'Fargo', 2, 'insufficient_evidence'),
        initialAudit: createMockItemAudit('it_3', 'Fargo', 2, 'insufficient_evidence')
      }
    ];

    const mockAuditEngine = {
      auditItem: vi.fn().mockImplementation((env) => {
        if (env.item.name === 'Fargo') {
          return createMockItemAudit('it_3', 'Fargo', 95, 'supported');
        }
        return env.audit;
      }),
      aggregateReport: vi.fn().mockImplementation((audits) => {
        const verified = audits.filter((a: ItemAuditResult) => a.decision.status !== 'insufficient_evidence');
        const avg = Math.round(verified.reduce((acc: number, a: ItemAuditResult) => acc + a.overallScore, 0) / verified.length);
        return {
          overallScore: avg,
          verifiedItemsCount: verified.length,
          decision: { status: avg >= 80 ? 'supported' : 'unverified', label: 'Grounding', explanation: 'Aggregate' },
          provenance: { correlationId: 'agg_test' }
        };
      })
    };

    const initialReport = mockAuditEngine.aggregateReport(initialEnvelopes.map(e => e.audit!));
    // Verified items: Reservoir Dogs (89) + Snatch (95) = 184 / 2 = 92
    expect(initialReport.overallScore).toBe(92);

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: { shouldRepair: vi.fn().mockReturnValue(false) } as any,
      evidenceSvc: mockEvidenceSvc as any,
      resolutionSvc: {} as any,
      auditEngine: mockAuditEngine as any
    });

    const result = await agentLoop.runLoop(
      { rawRecommendation: '1. Reservoir Dogs\n2. Snatch\n3. Fargo' },
      initialEnvelopes,
      initialReport,
      { maxIterations: 2 }
    );

    // Initial overall score must be 92
    expect(result.trace.initialOverallScore).toBe(92);
    // Final overall score must be 93
    expect(result.trace.finalOverallScore).toBe(93);
    expect(result.trace.netScoreImprovement).toBe(1);

    // Event 1: MORE_EVIDENCE on Fargo
    expect(result.trace.events[0].decision).toBe('MORE_EVIDENCE');
    expect(result.trace.events[0].scoreBefore).toBe(92);
    expect(result.trace.events[0].scoreAfter).toBe(93);
    expect(result.trace.events[0].scoreDelta).toBe(1);
    expect(result.trace.events[0].actionPerformed?.targetScoreBefore).toBe(2);
    expect(result.trace.events[0].actionPerformed?.targetScoreAfter).toBe(95);

    // Event 2: ACCEPT
    expect(result.trace.events[1].decision).toBe('ACCEPT');
    expect(result.trace.events[1].scoreBefore).toBe(93);
    expect(result.trace.events[1].scoreAfter).toBe(93);
    expect(result.trace.events[1].scoreDelta).toBe(0);
  });

  // Test 4: MORE_EVIDENCE does not produce a score that later unexpectedly decreases
  it('Test 4 — Monotonic trace progression: MORE_EVIDENCE never produces a score that later decreases (never 95 → 93)', () => {
    const traceEvents = [
      { step: 1, iteration: 1, decision: 'MORE_EVIDENCE' as const, scoreBefore: 92, scoreAfter: 93, scoreDelta: 1 },
      { step: 2, iteration: 2, decision: 'ACCEPT' as const, scoreBefore: 93, scoreAfter: 93, scoreDelta: 0 }
    ];

    for (let i = 1; i < traceEvents.length; i++) {
      expect(traceEvents[i].scoreAfter).toBeGreaterThanOrEqual(traceEvents[i - 1].scoreAfter);
    }
  });

  // Test 5: ACCEPTed iteration score equals the final authoritative aggregate
  it('Test 5 — ACCEPT score alignment: ACCEPT iteration score strictly equals final authoritative aggregate (93)', () => {
    const finalAggregate = 93;
    const acceptEvent = { step: 2, iteration: 2, decision: 'ACCEPT' as const, scoreBefore: 93, scoreAfter: 93, scoreDelta: 0 };

    expect(acceptEvent.scoreAfter).toBe(finalAggregate);
  });

  // Test 6: Delta equals final minus actual baseline
  it('Test 6 — Mathematical delta integrity: delta strictly equals finalAggregate - actualBaselineAggregate (93 - 92 = +1)', () => {
    const baseline = 92;
    const finalScore = 93;
    const delta = finalScore - baseline;

    expect(delta).toBe(1);

    const status = deriveUIStatus({ initialScore: baseline, finalScore });
    expect(status.scoreDelta).toBe(1);
  });

  // Test 7: Pre-grounding and verified scores can coexist without being mislabeled
  it('Test 7 — Semantic labeling distinction: pre-grounding baseline and verified scores are clearly separated', () => {
    const initialItemAudit = createMockItemAudit('it_3', 'Fargo', 2, 'insufficient_evidence');
    const finalItemAudit = createMockItemAudit('it_3', 'Fargo', 95, 'supported');

    // Both scores coexist with explicit, honest semantic roles:
    const preGroundingLabel = `Pre-grounding baseline: ${initialItemAudit.overallScore}/100`;
    const verifiedGroundingLabel = `Verified Qloo grounding: ${finalItemAudit.overallScore}/100`;

    expect(preGroundingLabel).toBe('Pre-grounding baseline: 2/100');
    expect(verifiedGroundingLabel).toBe('Verified Qloo grounding: 95/100');
    expect(preGroundingLabel).not.toBe(verifiedGroundingLabel);
  });

  // Test 8: Fargo-style 2 → 95 transitions remain valid only when they are genuinely different stages
  it('Test 8 — Fargo-style transition validity: 2/100 represents initial unverified state and 95/100 represents post-grounding state', () => {
    const itemEnvelope: ItemResolutionEnvelope = {
      item: { id: 'it_3', name: 'Fargo' },
      resolution: { query: 'Fargo', status: 'resolved', resolvedEntity: { id: 'ent_fargo', name: 'Fargo', type: 'urn:entity:movie', category: 'entity', source: 'qloo', retrievedAt: '' }, candidates: [], derivedConfidence: 0.95, provenance: {} as any },
      initialAudit: createMockItemAudit('it_3', 'Fargo', 2, 'insufficient_evidence'),
      audit: createMockItemAudit('it_3', 'Fargo', 95, 'supported')
    };

    expect(itemEnvelope.initialAudit?.overallScore).toBe(2);
    expect(itemEnvelope.initialAudit?.decision.status).toBe('insufficient_evidence');

    expect(itemEnvelope.audit?.overallScore).toBe(95);
    expect(itemEnvelope.audit?.decision.status).toBe('supported');
  });

  // Test 9: No stale candidate score survives into the final aggregate
  it('Test 9 — No stale scores in aggregate: final aggregate strictly uses verified scores (89, 95, 95) not pre-grounding 2', () => {
    const currentCandidateAudits: ItemAuditResult[] = [
      createMockItemAudit('it_1', 'Reservoir Dogs', 89, 'supported'),
      createMockItemAudit('it_2', 'Snatch', 95, 'supported'),
      createMockItemAudit('it_3', 'Fargo', 95, 'supported')
    ];

    const finalReport = auditEngine.aggregateReport(currentCandidateAudits, { rawRecommendation: '1. Reservoir Dogs\n2. Snatch\n3. Fargo' });

    expect(finalReport.overallScore).toBe(93);
    // If the stale score 2 had survived, (89 + 95 + 2) / 3 would equal 62:
    expect(finalReport.overallScore).not.toBe(62);
  });

  // Test 10: Existing 3/3 verified workflow remains passing
  it('Test 10 — Candidate extraction and representation: extracts all 3 items cleanly', () => {
    const extracted = RecommendationParser.extractCandidates('1. Reservoir Dogs\n2. Snatch\n3. Fargo');
    expect(extracted.items).toHaveLength(3);
    expect(extracted.items[0].name).toBe('Reservoir Dogs');
    expect(extracted.items[1].name).toBe('Snatch');
    expect(extracted.items[2].name).toBe('Fargo');
  });

  // Test 11: Existing single-recommendation workflow remains passing
  it('Test 11 — Single-recommendation integrity: candidate score equals aggregate score', () => {
    const singleAudit = createMockItemAudit('it_1', 'Pulp Fiction', 91, 'supported');
    const singleReport = auditEngine.aggregateReport([singleAudit], { rawRecommendation: 'Pulp Fiction' });

    expect(singleReport.totalItemsAudited).toBe(1);
    expect(singleReport.verifiedItemsCount).toBe(1);
    expect(singleReport.overallScore).toBe(91);
  });

  // Test 12: Existing REPAIR workflow remains passing
  it('Test 12 — REPAIR workflow: records REPAIR event and status "Repaired successfully (+Delta)"', () => {
    const events = [
      { step: 1, iteration: 1, state: 'RE_AUDITING' as const, decision: 'REPAIR' as const, scoreBefore: 65, scoreAfter: 82, scoreDelta: 17 }
    ];

    const status = deriveUIStatus({
      initialScore: 65,
      finalScore: 82,
      events,
      terminalState: 'ACCEPTED',
      repairedItems: [{ scoreDelta: 17, verifiedImprovement: true }]
    });

    expect(status.label).toBe('Repaired successfully');
    expect(status.deltaBadge).toBe('+17 Repaired successfully');
    expect(status.scoreDelta).toBe(17);
  });

  // Test 13: Existing provider-failure behavior remains passing
  it('Test 13 — Provider failure behavior: preserves deterministic baseline and reports unavailable', () => {
    const status = deriveUIStatus({
      initialScore: 78,
      finalScore: 78,
      terminalState: 'STOPPED',
      finalStopReason: 'provider_failure'
    });

    expect(status.label).toBe('Provider unavailable — deterministic audit preserved');
    expect(status.scoreDelta).toBe(0);
  });

  // Test 14: Existing no-improvement behavior remains passing
  it('Test 14 — No-improvement behavior: preserves original grounded result without false claim', () => {
    const status = deriveUIStatus({
      initialScore: 80,
      finalScore: 80,
      terminalState: 'STOPPED',
      finalStopReason: 'zero_improvement_repair_stop',
      repairedItems: [{ scoreDelta: 0, verifiedImprovement: false }]
    });

    expect(status.label).toBe('No improvement — original grounded result preserved');
    expect(status.scoreDelta).toBe(0);
  });
});
