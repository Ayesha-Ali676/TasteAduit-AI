import { describe, it, expect, vi } from 'vitest';
import { RecommendationParser } from '../src/services/orchestrator/parser.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { ItemResolutionEnvelope, ParseStageInput } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult } from '../src/services/audit/audit.types.js';

describe('TasteAudit AI — Multi-Recommendation GPT Output Audit Suite', () => {
  const auditEngine = new CulturalGroundingAuditEngine();

  // Test 1: Numbered GPT list
  it('Test 1 — Numbered GPT list: extracts individual recommendation candidates', () => {
    const input = `Here are the best restaurants:

1. Restaurant A
2. Restaurant B
3. Restaurant C`;

    const parsed = RecommendationParser.parse({ rawRecommendation: input });
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0].name).toBe('Restaurant A');
    expect(parsed.items[1].name).toBe('Restaurant B');
    expect(parsed.items[2].name).toBe('Restaurant C');
  });

  // Test 2: Bulleted list
  it('Test 2 — Bulleted list: extracts independent candidates', () => {
    const input = `- Restaurant A
- Restaurant B
- Restaurant C`;

    const parsed = RecommendationParser.parse({ rawRecommendation: input });
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0].name).toBe('Restaurant A');
    expect(parsed.items[1].name).toBe('Restaurant B');
    expect(parsed.items[2].name).toBe('Restaurant C');
  });

  // Test 3: Candidate + explanation
  it('Test 3 — Candidate + explanation: ensures explanation is not treated as part of the entity name', () => {
    const input = `Sure! Here are the 3 best restaurants in Ghulam Muhammad Abad, Faisalabad:

1. **Farzand Foods Centre** - Famous for traditional street foods, naan chanay, and local breakfast.
2. **Waqar Restaurant – Madina Chowk**: Great local seating with popular BBQ dishes and karahi.
3. **Baba Tikka Shop** – Known for spicy grilled chicken skewers.

Hope this helps!`;

    const parsed = RecommendationParser.parse({ rawRecommendation: input });
    expect(parsed.items).toHaveLength(3);

    // Entity 1
    expect(parsed.items[0].name).toBe('Farzand Foods Centre');
    expect(parsed.items[0].description).toContain('Famous for traditional street foods');
    expect(parsed.items[0].name).not.toContain('Famous for');

    // Entity 2 (preserving branch qualifier without explanation)
    expect(parsed.items[1].name).toBe('Waqar Restaurant – Madina Chowk');
    expect(parsed.items[1].description).toContain('Great local seating');
    expect(parsed.items[1].name).not.toContain('Great local seating');

    // Entity 3
    expect(parsed.items[2].name).toBe('Baba Tikka Shop');
    expect(parsed.items[2].description).toContain('Known for spicy grilled chicken');

    // Location inferred from preamble
    expect(parsed.location).toBe('Ghulam Muhammad Abad, Faisalabad');
  });

  // Test 3b: Headings followed by multiline explanations
  it('Test 3b — Headings followed by multiline explanations: does not treat explanation lines as entities', () => {
    const input = `Here are the top picks:

1. Restaurant A
   Great for traditional food.
   Very popular for family dinners.

2. Restaurant B
   Good for quick service and snacks.`;

    const parsed = RecommendationParser.parse({ rawRecommendation: input });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].name).toBe('Restaurant A');
    expect(parsed.items[0].description).toContain('Great for traditional food');
    expect(parsed.items[1].name).toBe('Restaurant B');
    expect(parsed.items[1].description).toContain('Good for quick service');
  });

  // Helper to create mock item audit results
  function createMockItemAudit(
    itemId: string,
    itemName: string,
    score: number,
    status: 'supported' | 'inferred' | 'unverified' | 'insufficient_evidence'
  ): ItemAuditResult {
    return {
      itemId,
      itemName,
      overallScore: score,
      dimensions: {
        culturalAlignment: {
          name: 'culturalAlignment',
          score,
          weight: 0.4,
          weightedScore: score * 0.4,
          classification: score >= 80 ? 'Supported' : 'Unverified',
          reasons: [],
          evidenceRefs: []
        },
        contextualRelevance: {
          name: 'contextualRelevance',
          score,
          weight: 0.25,
          weightedScore: score * 0.25,
          classification: score >= 80 ? 'Supported' : 'Unverified',
          reasons: [],
          evidenceRefs: []
        },
        constraintCompliance: {
          name: 'constraintCompliance',
          score,
          weight: 0.2,
          weightedScore: score * 0.2,
          classification: score >= 80 ? 'Supported' : 'Unverified',
          reasons: [],
          evidenceRefs: []
        },
        evidenceCompleteness: {
          name: 'evidenceCompleteness',
          score: status === 'insufficient_evidence' ? 10 : score,
          weight: 0.15,
          weightedScore: (status === 'insufficient_evidence' ? 10 : score) * 0.15,
          classification: score >= 80 ? 'Supported' : 'Unverified',
          reasons: [],
          evidenceRefs: []
        }
      },
      decision: {
        status,
        label: status === 'supported' ? 'Culturally Grounded' : status === 'insufficient_evidence' ? 'Insufficient Qloo Evidence' : 'Unverified',
        explanation: `Audit status: ${status}`
      },
      evidenceRefs: [],
      provenance: {
        source: 'tasteaudit',
        operation: 'cultural_grounding_audit',
        correlationId: `test_${itemId}`,
        auditedAt: new Date().toISOString(),
        classification: score >= 80 ? 'Supported' : 'Unverified'
      }
    };
  }

  // Test 4: Mixed resolved/unresolved candidates
  it('Test 4 — Mixed resolved/unresolved candidates: preserves honest candidate-level statuses', () => {
    const itemAudits: ItemAuditResult[] = [
      createMockItemAudit('it_1', 'Restaurant 1', 89, 'supported'),
      createMockItemAudit('it_2', 'Restaurant 2', 82, 'supported'),
      createMockItemAudit('it_3', 'Restaurant 3', 76, 'inferred'),
      createMockItemAudit('it_4', 'Restaurant 4', 0, 'insufficient_evidence'),
      createMockItemAudit('it_5', 'Restaurant 5', 0, 'insufficient_evidence')
    ];

    const input: ParseStageInput = { rawRecommendation: 'Multiple items' };
    const report = auditEngine.aggregateReport(itemAudits, input);

    expect(report.totalItemsAudited).toBe(5);
    expect(report.verifiedItemsCount).toBe(3);
    expect(report.itemsSummary.supportedCount).toBe(2);
    expect(report.itemsSummary.inferredCount).toBe(1);
    expect(report.itemsSummary.insufficientCount).toBe(2);

    // Verified candidates average: (89 + 82 + 76) / 3 = 82.33 -> 82
    expect(report.overallScore).toBe(82);
    expect(report.decision.status).toBe('supported');
  });

  // Test 5: One unresolved candidate must NOT collapse the entire result to 2/100
  it('Test 5 — One unresolved candidate must NOT collapse the entire result to 2/100', () => {
    const itemAudits: ItemAuditResult[] = [
      createMockItemAudit('it_1', 'Farzand Foods Centre', 89, 'supported'),
      createMockItemAudit('it_2', 'Waqar Restaurant', 85, 'supported'),
      createMockItemAudit('it_3', 'Al-Madina BBQ', 81, 'supported'),
      createMockItemAudit('it_4', 'Unresolved Street Cart', 2, 'insufficient_evidence')
    ];

    const input: ParseStageInput = { rawRecommendation: '4 restaurants' };
    const report = auditEngine.aggregateReport(itemAudits, input);

    // The score of verified items: (89 + 85 + 81) / 3 = 85
    expect(report.overallScore).toBe(85);
    expect(report.overallScore).not.toBe(2);
    expect(report.overallScore).not.toBeLessThan(60);
    expect(report.verifiedItemsCount).toBe(3);
  });

  // Test 6: Provider failure preserves deterministic audit
  it('Test 6 — Provider failure: deterministic audit remains visible and unharmed', async () => {
    const mockAI: AIOrchestratorProvider = {
      isAnyConfigured: vi.fn().mockReturnValue(true),
      executeCompletion: vi.fn().mockResolvedValue({
        success: false,
        error: 'Groq request timed out; OpenRouter request timed out',
        providerUsed: 'openrouter'
      }),
      executeRepair: vi.fn(),
      executeEntityResolution: vi.fn(),
      getHealth: vi.fn()
    } as unknown as AIOrchestratorProvider;

    const mockRepairSvc = {
      repairItem: vi.fn(),
      aggregateRepairReport: vi.fn(),
      shouldRepair: vi.fn().mockReturnValue(false)
    };

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn(),
      getCacheStats: vi.fn(),
      clearCache: vi.fn()
    };

    const mockResolutionSvc = {
      resolve: vi.fn(),
      resolveDiscovery: vi.fn()
    };

    const agentLoop = new TasteAuditAgentLoop({
      ai: mockAI,
      repairSvc: mockRepairSvc as any,
      evidenceSvc: mockEvidenceSvc as any,
      resolutionSvc: mockResolutionSvc as any,
      auditEngine
    });

    const initialEnvelopes: ItemResolutionEnvelope[] = [
      {
        item: { id: 'it_1', name: 'Farzand Foods Centre' },
        resolution: {
          query: 'Farzand Foods Centre',
          status: 'resolved',
          candidates: [],
          derivedConfidence: 0.9,
          provenance: {} as any
        },
        audit: createMockItemAudit('it_1', 'Farzand Foods Centre', 65, 'inferred')
      }
    ];

    const initialReport = auditEngine.aggregateReport(
      initialEnvelopes.map(e => e.audit!),
      { rawRecommendation: 'Farzand Foods Centre' }
    );

    const result = await agentLoop.runLoop(
      { rawRecommendation: 'Farzand Foods Centre' },
      initialEnvelopes,
      initialReport,
      { maxIterations: 1 }
    );

    // Deterministic audit report must remain intact and authoritative
    expect(result.auditReport.overallScore).toBe(65);
    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('provider_failure');
    // Non-blocking user-friendly notice recorded
    expect(result.trace.events.some(e => e.reasoning.includes('AI Agent unavailable — deterministic Qloo audit preserved'))).toBe(true);
  });

  // Test 7: Single recommendation behavior remains unchanged
  it('Test 7 — Single recommendation: existing behavior remains unchanged', () => {
    const r1 = RecommendationParser.parse({ rawRecommendation: 'Pulp Fiction' });
    expect(r1.items).toHaveLength(1);
    expect(r1.items[0].name).toBe('Pulp Fiction');

    const r2 = RecommendationParser.parse({ rawRecommendation: 'Radiohead' });
    expect(r2.items).toHaveLength(1);
    expect(r2.items[0].name).toBe('Radiohead');

    const r3 = RecommendationParser.parse({ rawRecommendation: 'Recommend Dishoom for young professionals' });
    expect(r3.items).toHaveLength(1);
    expect(r3.items[0].name).toBe('Dishoom');
    expect(r3.items[0].isDiscovery).toBeFalsy();
  });

  // Test 8: Existing natural-language discovery behavior remains unchanged
  it('Test 8 — Existing natural-language discovery: existing behavior remains unchanged', () => {
    const raw = 'I want something interesting to watch tonight';
    const res = RecommendationParser.parse({
      rawRecommendation: raw
    });
    expect(res.isDiscovery).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].isDiscovery).toBe(true);
    expect(res.items[0].name).not.toBe(raw);
    expect(res.items[0].discoveryIntent?.domain).toBe('movie');
  });

  // Test 9: Complete GPT output workflow for Faisalabad restaurants
  it('Test 9 — Real-world complete GPT answer workflow: extracts candidates from ellipses prose format', () => {
    const gptProse = 'Sure! Here are the 3 best restaurants in Ghulam Muhammad Abad, Faisalabad: Farzand Foods Centre ... Waqar Restaurant – Madina Chowk ... Best Overall ...';

    const parsed = RecommendationParser.parse({ rawRecommendation: gptProse });
    expect(parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(parsed.items[0].name).toBe('Farzand Foods Centre');
    expect(parsed.items[1].name).toBe('Waqar Restaurant – Madina Chowk');
    expect(parsed.location).toBe('Ghulam Muhammad Abad, Faisalabad');
  });
});

