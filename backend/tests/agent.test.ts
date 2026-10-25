import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { AgentDecisionSchema } from '../src/services/agent/agent.schemas.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { AIProvider, ChatMessage, AICompletionResult, AIRepairCandidate } from '../src/services/ai/ai.types.js';
import { ItemResolutionEnvelope, ParseStageInput } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult, OverallAuditReport } from '../src/services/audit/audit.types.js';
import { RepairService } from '../src/services/repair/repair.service.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';

describe('Stage 6: Bounded Agent Loop & Orchestration Supervisor', () => {
  // Helper to create a mock audit result
  function createMockAuditResult(overrides: Partial<ItemAuditResult> = {}): ItemAuditResult {
    return {
      itemId: 'it_1',
      itemName: 'Test Recommendation',
      overallScore: 45,
      dimensions: {
        culturalAlignment: {
          name: 'culturalAlignment',
          score: 40,
          weight: 0.4,
          weightedScore: 16,
          classification: 'Inferred',
          reasons: ['Weak cultural signals.'],
          evidenceRefs: []
        },
        contextualRelevance: {
          name: 'contextualRelevance',
          score: 50,
          weight: 0.25,
          weightedScore: 12.5,
          classification: 'Inferred',
          reasons: ['Generic context match.'],
          evidenceRefs: []
        },
        constraintCompliance: {
          name: 'constraintCompliance',
          score: 0,
          weight: 0.2,
          weightedScore: 0,
          classification: 'Unverified',
          reasons: ["[FAIL] Negative constraint 'no pop' violated."],
          evidenceRefs: []
        },
        evidenceCompleteness: {
          name: 'evidenceCompleteness',
          score: 50,
          weight: 0.15,
          weightedScore: 7.5,
          classification: 'Unverified',
          reasons: ['Low signal density.'],
          evidenceRefs: []
        }
      },
      decision: {
        status: 'unverified',
        label: 'Weak Grounding (Unverified)',
        explanation: 'Low cultural alignment or constraint violation.'
      },
      evidenceRefs: ['qloo:test_ref'],
      provenance: {
        source: 'tasteaudit',
        operation: 'audit_cultural_grounding',
        correlationId: 'c1',
        auditedAt: new Date().toISOString(),
        classification: 'Unverified'
      },
      ...overrides
    };
  }

  // Helper to create mock overall audit report
  function createMockOverallReport(
    overallScore = 45,
    status: 'supported' | 'unverified' | 'insufficient_evidence' = 'unverified'
  ): OverallAuditReport {
    return {
      overallScore,
      confidence: 70,
      decision: {
        status,
        label: status === 'supported' ? 'Culturally Grounded' : 'Weak Grounding',
        explanation: 'Overall grounding assessment.'
      },
      dimensionsSummary: {
        culturalAlignment: overallScore,
        contextualRelevance: overallScore,
        constraintCompliance: overallScore,
        evidenceCompleteness: overallScore
      },
      totalItemsAudited: 1,
      itemsSummary: {
        supportedCount: status === 'supported' ? 1 : 0,
        inferredCount: 0,
        unverifiedCount: status === 'unverified' ? 1 : 0,
        insufficientCount: status === 'insufficient_evidence' ? 1 : 0
      },
      provenance: {
        source: 'tasteaudit',
        operation: 'aggregate_report',
        correlationId: 'agg_c1',
        auditedAt: new Date().toISOString()
      }
    };
  }

  // Helper to create mock envelope
  function createMockEnvelope(overrides: Partial<ItemResolutionEnvelope> = {}): ItemResolutionEnvelope {
    return {
      item: { id: 'it_1', name: 'Original Item' },
      resolution: {
        query: 'Original Item',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_original_123',
          name: 'Original Item',
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
          correlationId: 'res_c1',
          resolutionStatus: 'resolved',
          qlooType: 'urn:entity:movie'
        }
      },
      evidence: {
        status: 'supported',
        entityId: 'ent_original_123',
        entityName: 'Original Item',
        entityType: 'urn:entity:movie',
        signals: [
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_verified_alt_456',
            relatedEntityName: 'Verified Alternative Film',
            value: 0.95,
            tags: ['Classic', 'Drama']
          }
        ],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'retrieve_insights',
          correlationId: 'ev_c1',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      },
      audit: createMockAuditResult(),
      ...overrides
    };
  }

  // Helper for mock repair service
  function createDefaultMockRepairSvc(overrides: Partial<RepairService> = {}): RepairService {
    return {
      shouldRepair: vi.fn().mockImplementation((env: ItemResolutionEnvelope) => {
        return (env.audit?.overallScore ?? 0) < 80;
      }),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'ent_verified_alt_456', name: 'Verified Alternative Film', type: 'urn:entity:movie', category: 'entity' }
      ]),
      repairItem: vi.fn().mockResolvedValue({
        originalItem: 'Original Item',
        status: 'repaired',
        repairStrategy: 'qloo_affinity_substitution',
        selectedCandidate: { entityId: 'ent_verified_alt_456', name: 'Verified Alternative Film', type: 'urn:entity:movie' },
        reasoning: 'Replaced with verified high-affinity classic film.',
        beforeAudit: createMockAuditResult({ overallScore: 45 }),
        afterAudit: createMockAuditResult({
          overallScore: 85,
          decision: { status: 'supported', label: 'Culturally Grounded', explanation: 'Verified' },
          dimensions: {
            ...createMockAuditResult().dimensions,
            constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] }
          }
        }),
        scoreDelta: 40,
        verifiedImprovement: true,
        providerUsed: 'groq',
        evidenceRefs: ['qloo:ent_verified_alt_456'],
        repairedEnvelope: createMockEnvelope({
          item: { id: 'it_1', name: 'Verified Alternative Film' },
          audit: createMockAuditResult({
            overallScore: 85,
            decision: { status: 'supported', label: 'Culturally Grounded', explanation: 'Verified' },
            dimensions: {
              ...createMockAuditResult().dimensions,
              constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] }
            }
          })
        })
      }),
      aggregateRepairReport: vi.fn().mockReturnValue({
        totalItemsAudited: 1,
        itemsRepairedCount: 1,
        itemsSkippedCount: 0,
        itemsFailedCount: 0,
        averageScoreBefore: 45,
        averageScoreAfter: 85,
        netImprovement: 40,
        repairedItems: []
      }),
      ...overrides
    } as unknown as RepairService;
  }

  // Mock AI Provider helper
  function createMockAIProvider(name: 'groq' | 'openrouter', responsePayload: unknown): AIProvider {
    return {
      name,
      isConfigured: () => true,
      generateCompletion: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify(responsePayload),
        provider: name,
        model: 'test-model'
      } as AICompletionResult)
    };
  }

  const defaultInput: ParseStageInput = {
    rawRecommendation: 'Check out Original Item',
    audienceContext: 'Film aficionados',
    location: 'London',
    constraints: ['no pop']
  };

  it('1. should immediately ACCEPT high-scoring initial audit without repairs', async () => {
    const supportedAudit = createMockAuditResult({
      overallScore: 88,
      dimensions: {
        culturalAlignment: { name: 'culturalAlignment', score: 90, weight: 0.4, weightedScore: 36, classification: 'Supported', reasons: [], evidenceRefs: [] },
        contextualRelevance: { name: 'contextualRelevance', score: 85, weight: 0.25, weightedScore: 21.25, classification: 'Supported', reasons: [], evidenceRefs: [] },
        constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] },
        evidenceCompleteness: { name: 'evidenceCompleteness', score: 85, weight: 0.15, weightedScore: 12.75, classification: 'Supported', reasons: [], evidenceRefs: [] }
      },
      decision: { status: 'supported', label: 'Culturally Grounded', explanation: 'Strong signals.' }
    });
    const supportedEnvelope = createMockEnvelope({ audit: supportedAudit });
    const supportedReport = createMockOverallReport(88, 'supported');

    const agentLoop = new TasteAuditAgentLoop();
    const result = await agentLoop.runLoop(defaultInput, [supportedEnvelope], supportedReport);

    expect(result.trace.terminalState).toBe('ACCEPTED');
    expect(result.trace.finalStopReason).toBe('all_items_supported');
    expect(result.trace.totalIterations).toBe(1);
    expect(result.trace.events.length).toBe(1);
    expect(result.trace.events[0].decision).toBe('ACCEPT');
    expect(result.trace.events[0].scoreBefore).toBe(88);
  });

  it('2. should execute REPAIR with verified candidate, re-audit, and record positive score delta', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'REPAIR',
      targetItemId: 'it_1',
      suggestedCandidateId: 'ent_verified_alt_456',
      reasoning: 'Replace Original Item with verified Qloo candidate to satisfy constraints.'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const mockRepairSvc = createDefaultMockRepairSvc();

    const mockAuditEngine = {
      auditItem: vi.fn(),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(85, 'supported'))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: mockRepairSvc,
      auditEngine: mockAuditEngine
    });

    const envelope = createMockEnvelope();
    const result = await agentLoop.runLoop(defaultInput, [envelope], createMockOverallReport(45));

    expect(result.trace.terminalState).toBe('ACCEPTED');
    expect(result.trace.netScoreImprovement).toBe(40);
    const repairEvent = result.trace.events.find((e) => e.decision === 'REPAIR');
    expect(repairEvent).toBeDefined();
    expect(repairEvent?.scoreDelta).toBe(40);
    expect(repairEvent?.actionPerformed?.candidateSelected?.id).toBe('ent_verified_alt_456');
  });

  it('3. should handle MORE_EVIDENCE by retrieving fresh signals and re-auditing', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'MORE_EVIDENCE',
      targetItemId: 'it_1',
      reasoning: 'Retrieve additional Qloo insights to ground ambiguous entity.'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [
          { signalType: 'taste_affinity', value: 0.9, tags: ['Art'] },
          { signalType: 'cultural_tag', relatedEntityName: 'Independent' }
        ],
        summary: { signalsCount: 2, hasLocationSignal: false },
        provenance: { classification: 'Supported', correlationId: 'ev_more_1' }
      })
    } as unknown as EvidenceRetrievalService;

    const mockAuditEngine = {
      auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 82, decision: { status: 'supported', label: 'Supported', explanation: 'Strong signals' } })),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(82, 'supported'))
    } as unknown as CulturalGroundingAuditEngine;

    const envelope = createMockEnvelope({
      evidence: {
        status: 'insufficient_evidence',
        signals: [],
        summary: { signalsCount: 0, hasLocationSignal: false },
        provenance: { classification: 'Unverified', correlationId: 'ev_init' } as any
      }
    });

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc(),
      evidenceSvc: mockEvidenceSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [envelope], createMockOverallReport(40));

    expect(mockEvidenceSvc.retrieveEvidence).toHaveBeenCalled();
    const moreEvEvent = result.trace.events.find((e) => e.decision === 'MORE_EVIDENCE');
    expect(moreEvEvent).toBeDefined();
    expect(moreEvEvent?.scoreAfter).toBe(82);
  });

  it('4. should gracefully handle STOP decision requested by agent', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'STOP',
      reasoning: 'No further viable cultural taste substitutions exist in target domain.',
      stopReason: 'domain_saturation'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc()
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(55));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('domain_saturation');
  });

  it('5. should safely halt with insufficient_evidence when zero verified candidates exist for repair', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'REPAIR',
      targetItemId: 'it_1',
      reasoning: 'Attempt repair.'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const mockRepairSvc = createDefaultMockRepairSvc({
      shouldRepair: vi.fn().mockReturnValue(true),
      getVerifiedCandidates: vi.fn().mockResolvedValue([]) // ZERO candidates
    });

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: mockRepairSvc
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(50));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('insufficient_evidence');
  });

  it('6. should strictly enforce maximum iterations bound', async () => {
    const mockProvider = {
      name: 'groq' as const,
      isConfigured: () => true,
      generateCompletion: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({ decision: 'MORE_EVIDENCE', targetItemId: 'it_1', reasoning: 'Querying' }),
        provider: 'groq',
        model: 'm1'
      } as AICompletionResult)
    };

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [{ signalType: 'taste_affinity', value: 0.9 }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { classification: 'Supported', correlationId: 'c1' }
      })
    } as unknown as EvidenceRetrievalService;

    const mockAuditEngine = {
      auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 60 })), // Still < 80
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(60))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc(),
      evidenceSvc: mockEvidenceSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(50), { maxIterations: 2 });

    expect(result.trace.totalIterations).toBeLessThanOrEqual(2);
    expect(result.trace.terminalState).toBe('STOPPED');
  });

  it('7. should trigger circuit breaker on repeated identical action', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'MORE_EVIDENCE',
      targetItemId: 'it_1',
      reasoning: 'Same query again.'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [{ signalType: 'taste_affinity', value: 0.8 }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { classification: 'Supported', correlationId: 'c1' }
      })
    } as unknown as EvidenceRetrievalService;

    const mockAuditEngine = {
      auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 60 })),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(60))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc(),
      evidenceSvc: mockEvidenceSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(50), { maxIterations: 3 });

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('repeated_action_halt');
  });

  it('8. should safely preserve deterministic baseline on provider failure', async () => {
    const failingProvider: AIProvider = {
      name: 'groq',
      isConfigured: () => true,
      generateCompletion: vi.fn().mockResolvedValue({
        success: false,
        error: '503 Service Unavailable',
        provider: 'groq',
        model: 'm1'
      })
    };

    const aiOrchestrator = new AIOrchestratorProvider({
      primaryProvider: failingProvider,
      fallbackProvider: { ...failingProvider, name: 'openrouter' }
    });

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc()
    });
    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(52));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('provider_failure');
    expect(result.auditReport.overallScore).toBe(52); // Preserved
  });

  it('9. should safely halt on invalid decision schema from AI', async () => {
    const invalidProvider = createMockAIProvider('groq', {
      decision: 'UNRECOGNIZED_ACTION', // Invalid enum
      reasoning: 'Doing something unauthorized'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: invalidProvider });
    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc()
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(55));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('invalid_decision_schema');
  });

  it('10. should reject fabricated candidate not present in verified Qloo candidate list', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'REPAIR',
      targetItemId: 'it_1',
      suggestedCandidateId: 'fabricated_hallucination_999', // Not in verified list!
      reasoning: 'Inventing a fake entity'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const mockRepairSvc = createDefaultMockRepairSvc({
      shouldRepair: vi.fn().mockReturnValue(true),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'real_verified_entity_111', name: 'Real Entity', type: 'urn:entity:movie' }
      ])
    });

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: mockRepairSvc
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(48));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('fabricated_candidate_rejected');
  });

  it('11. should preserve score authority: AI cannot alter deterministic score', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'ACCEPT',
      reasoning: 'I declare this score is 100 now!'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const deterministicScore = 42;
    const initialReport = createMockOverallReport(deterministicScore, 'unverified');

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc()
    });
    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], initialReport);

    // AI attempted to accept an ungrounded score (42) -> rejected per score authority check
    expect(result.auditReport.overallScore).toBe(42);
    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('premature_accept_rejected');
  });

  it('12. should execute multi-step convergence loop across multiple iterations', async () => {
    let callCount = 0;
    const multiStepProvider: AIProvider = {
      name: 'groq',
      isConfigured: () => true,
      generateCompletion: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: true,
            content: JSON.stringify({
              decision: 'REPAIR',
              targetItemId: 'it_1',
              suggestedCandidateId: 'ent_verified_1',
              reasoning: 'Step 1: Repair first item'
            }),
            provider: 'groq',
            model: 'm1'
          };
        } else {
          return {
            success: true,
            content: JSON.stringify({
              decision: 'ACCEPT',
              reasoning: 'Step 2: Recommendations are now culturally coherent'
            }),
            provider: 'groq',
            model: 'm1'
          };
        }
      })
    };

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: multiStepProvider });

    const mockRepairSvc = createDefaultMockRepairSvc({
      shouldRepair: vi.fn().mockImplementation((env) => env.item.name === 'Original Item'),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'ent_verified_1', name: 'Verified Classic', type: 'urn:entity:movie' }
      ]),
      repairItem: vi.fn().mockResolvedValue({
        originalItem: 'Original Item',
        status: 'repaired',
        repairStrategy: 'qloo_affinity_substitution',
        selectedCandidate: { entityId: 'ent_verified_1', name: 'Verified Classic' },
        reasoning: 'Repaired successfully',
        beforeAudit: createMockAuditResult({ overallScore: 50 }),
        afterAudit: createMockAuditResult({
          overallScore: 84,
          decision: { status: 'supported', label: 'Supported', explanation: 'Strong' },
          dimensions: {
            ...createMockAuditResult().dimensions,
            constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] }
          }
        }),
        scoreDelta: 34,
        verifiedImprovement: true,
        providerUsed: 'groq',
        evidenceRefs: ['qloo:ent_verified_1'],
        repairedEnvelope: createMockEnvelope({
          item: { id: 'it_1', name: 'Verified Classic' },
          audit: createMockAuditResult({
            overallScore: 84,
            decision: { status: 'supported', label: 'Supported', explanation: 'Strong' },
            dimensions: {
              ...createMockAuditResult().dimensions,
              constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] }
            }
          })
        })
      }),
      aggregateRepairReport: vi.fn().mockReturnValue({
        totalItemsAudited: 1,
        itemsRepairedCount: 1,
        itemsSkippedCount: 0,
        itemsFailedCount: 0,
        averageScoreBefore: 50,
        averageScoreAfter: 84,
        netImprovement: 34,
        repairedItems: []
      })
    });

    const mockAuditEngine = {
      auditItem: vi.fn(),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(84, 'supported'))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: mockRepairSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(50), { maxIterations: 3 });

    expect(result.trace.terminalState).toBe('ACCEPTED');
    expect(result.trace.netScoreImprovement).toBe(34);
    expect(result.trace.events.length).toBeGreaterThanOrEqual(2);
  });

  it('13. should produce sequential ordered trace events with monotonic timestamps', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'STOP',
      reasoning: 'Testing trace order',
      stopReason: 'trace_test_completed'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });
    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc()
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(60));

    expect(result.trace.events.length).toBeGreaterThan(0);
    for (let i = 0; i < result.trace.events.length; i++) {
      expect(result.trace.events[i].step).toBe(i + 1);
      expect(result.trace.events[i].durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.trace.events[i].timestamp).toBe('string');
    }
  });

  it('14. should safely stop when REPAIR produces zero or negative score delta', async () => {
    const mockProvider = createMockAIProvider('groq', {
      decision: 'REPAIR',
      targetItemId: 'it_1',
      suggestedCandidateId: 'ent_stagnant_candidate',
      reasoning: 'Attempt repair with stagnant candidate.'
    });

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockProvider });

    const mockRepairSvc = createDefaultMockRepairSvc({
      shouldRepair: vi.fn().mockReturnValue(true),
      getVerifiedCandidates: vi.fn().mockResolvedValue([
        { entityId: 'ent_stagnant_candidate', name: 'Stagnant Film', type: 'urn:entity:movie' }
      ]),
      repairItem: vi.fn().mockResolvedValue({
        originalItem: 'Original Item',
        status: 'repaired',
        repairStrategy: 'qloo_affinity_substitution',
        selectedCandidate: { entityId: 'ent_stagnant_candidate', name: 'Stagnant Film' },
        reasoning: 'No improvement',
        beforeAudit: createMockAuditResult({ overallScore: 50 }),
        afterAudit: createMockAuditResult({ overallScore: 50 }), // DELTA = 0
        scoreDelta: 0,
        verifiedImprovement: false,
        providerUsed: 'groq',
        evidenceRefs: [],
        repairedEnvelope: createMockEnvelope()
      }),
      aggregateRepairReport: vi.fn()
    });

    const mockAuditEngine = {
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(50))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: mockRepairSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [createMockEnvelope()], createMockOverallReport(50));

    expect(result.trace.terminalState).toBe('STOPPED');
    expect(result.trace.finalStopReason).toBe('zero_improvement_repair_stop');
  });

  it('15. should allow MORE_EVIDENCE to continue when evidence materially improves even if score delta is zero', async () => {
    let callIndex = 0;
    const provider: AIProvider = {
      name: 'groq',
      isConfigured: () => true,
      generateCompletion: vi.fn().mockImplementation(async () => {
        callIndex++;
        if (callIndex === 1) {
          return {
            success: true,
            content: JSON.stringify({
              decision: 'MORE_EVIDENCE',
              targetItemId: 'it_1',
              reasoning: 'Retrieve additional supporting evidence signals.'
            }),
            provider: 'groq',
            model: 'm1'
          };
        } else {
          return {
            success: true,
            content: JSON.stringify({
              decision: 'STOP',
              reasoning: 'Evidence confirmed; halting.',
              stopReason: 'confirmed_evidence'
            }),
            provider: 'groq',
            model: 'm1'
          };
        }
      })
    };

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: provider });

    // Initial envelope has 0 signals
    const envelope = createMockEnvelope({
      evidence: {
        status: 'insufficient_evidence',
        signals: [],
        summary: { signalsCount: 0, hasLocationSignal: false },
        provenance: { classification: 'Unverified', correlationId: 'c_init' } as any
      }
    });

    // Evidence retrieval returns 3 fresh signals (material improvement!)
    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [
          { signalType: 'taste_affinity', value: 0.9 },
          { signalType: 'taste_affinity', value: 0.85 },
          { signalType: 'cultural_tag', relatedEntityName: 'Indie' }
        ],
        summary: { signalsCount: 3, hasLocationSignal: false },
        provenance: { classification: 'Supported', correlationId: 'c_improved' }
      })
    } as unknown as EvidenceRetrievalService;

    // Score remains unchanged at 65 (scoreDelta = 0), but evidence status is now 'supported'
    const mockAuditEngine = {
      auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 65 })),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(65))
    } as unknown as CulturalGroundingAuditEngine;

    const agentLoop = new TasteAuditAgentLoop({
      ai: aiOrchestrator,
      repairSvc: createDefaultMockRepairSvc(),
      evidenceSvc: mockEvidenceSvc,
      auditEngine: mockAuditEngine
    });

    const result = await agentLoop.runLoop(defaultInput, [envelope], createMockOverallReport(65), { maxIterations: 3 });

    // Does NOT stop with zero_improvement because evidence materially improved!
    expect(result.trace.finalStopReason).toBe('confirmed_evidence');
    const moreEvEvent = result.trace.events.find((e) => e.decision === 'MORE_EVIDENCE');
    expect(moreEvEvent).toBeDefined();
    expect(moreEvEvent?.stopReason).toBeUndefined(); // Continued!
  });

  it('16. should execute through orchestrator when enableAgent is true', async () => {
    const mockResolutionSvc = {
      resolve: vi.fn().mockResolvedValue({
        query: 'Inception',
        status: 'resolved',
        resolvedEntity: { id: 'ent_inception', name: 'Inception', type: 'urn:entity:movie', category: 'entity' },
        candidates: [],
        provenance: { classification: 'Supported' }
      })
    } as unknown as EntityResolutionService;

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        signals: [{ signalType: 'taste_affinity', value: 0.9 }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { classification: 'Supported', correlationId: 'ev_1' }
      })
    } as unknown as EvidenceRetrievalService;

    const mockAuditEngine = {
      auditItem: vi.fn().mockReturnValue(
        createMockAuditResult({
          overallScore: 88,
          dimensions: {
            culturalAlignment: { name: 'culturalAlignment', score: 90, weight: 0.4, weightedScore: 36, classification: 'Supported', reasons: [], evidenceRefs: [] },
            contextualRelevance: { name: 'contextualRelevance', score: 85, weight: 0.25, weightedScore: 21.25, classification: 'Supported', reasons: [], evidenceRefs: [] },
            constraintCompliance: { name: 'constraintCompliance', score: 90, weight: 0.2, weightedScore: 18, classification: 'Supported', reasons: [], evidenceRefs: [] },
            evidenceCompleteness: { name: 'evidenceCompleteness', score: 85, weight: 0.15, weightedScore: 12.75, classification: 'Supported', reasons: [], evidenceRefs: [] }
          },
          decision: { status: 'supported', label: 'Supported', explanation: 'Strong' }
        })
      ),
      aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(88, 'supported'))
    } as unknown as CulturalGroundingAuditEngine;

    const orchestrator = new TasteAuditOrchestrator(
      mockResolutionSvc,
      mockEvidenceSvc,
      mockAuditEngine,
      createDefaultMockRepairSvc()
    );

    const result = await orchestrator.executePipeline(
      {
        rawRecommendation: 'Inception',
        audienceContext: 'Sci-fi enthusiasts'
      },
      { enableAgent: true, maxIterations: 1 }
    );

    expect(result.stagesExecuted).toContain('REPAIR');
    expect(result.stagesExecuted).toContain('RE-AUDIT');
    expect(result.agentTrace).toBeDefined();
    expect(result.message).toContain('Stage 6 (AGENT LOOP)');
  });

  describe('Surgical Fix: Agent Decision Schema & Verification Honesty', () => {
    it('1. STOP with suggestedCandidateId:null -> VALID', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'STOP',
        targetItemId: 'item-1',
        suggestedCandidateId: null,
        reasoning: 'No alternatives available',
        stopReason: 'no_alternatives'
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.suggestedCandidateId).toBeNull();
      }
    });

    it('2. STOP with stopReason:null -> VALID', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'STOP',
        targetItemId: null,
        suggestedCandidateId: null,
        reasoning: 'Bounded stop reached',
        stopReason: null
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.stopReason).toBeNull();
      }
    });

    it('3. malformed decision -> safely rejected', () => {
      const res = AgentDecisionSchema.safeParse('not an object');
      expect(res.success).toBe(false);

      const res2 = AgentDecisionSchema.safeParse({
        decision: 'STOP',
        reasoning: ''
      });
      expect(res2.success).toBe(false);
    });

    it('4. invalid decision enum -> safely rejected', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'CONTINUE',
        reasoning: 'Continue loop'
      });
      expect(res.success).toBe(false);
    });

    it('5. valid ACCEPT -> unchanged', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'ACCEPT',
        reasoning: 'All items are culturally grounded'
      });
      expect(res.success).toBe(true);
    });

    it('6. valid REPAIR -> unchanged', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'REPAIR',
        targetItemId: 'it_1',
        suggestedCandidateId: 'cand_123',
        reasoning: 'Substitute with verified candidate'
      });
      expect(res.success).toBe(true);
    });

    it('7. valid MORE_EVIDENCE -> unchanged', () => {
      const res = AgentDecisionSchema.safeParse({
        decision: 'MORE_EVIDENCE',
        targetItemId: 'it_1',
        reasoning: 'Ambiguous entity needs more Qloo tags'
      });
      expect(res.success).toBe(true);
    });

    it('8. agent loop executes STOP with suggestedCandidateId:null without invalid_decision_schema error', async () => {
      const mockAiProvider: AIProvider = {
        name: 'mock_groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'STOP',
            targetItemId: 'it_1',
            suggestedCandidateId: null,
            reasoning: 'No verified candidate alternatives available for repair.',
            stopReason: 'insufficient_candidates'
          }),
          model: 'qwen/qwen3.8-27b'
        })
      };

      const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockAiProvider });
      const envelope = createMockEnvelope();
      const mockAuditEngine = {
        auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 35 })),
        aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(35, 'unverified'))
      } as unknown as CulturalGroundingAuditEngine;

      const agentLoop = new TasteAuditAgentLoop({
        ai: aiOrchestrator,
        repairSvc: createDefaultMockRepairSvc(),
        evidenceSvc: { retrieveEvidence: vi.fn() } as unknown as EvidenceRetrievalService,
        auditEngine: mockAuditEngine
      });

      const result = await agentLoop.runLoop(defaultInput, [envelope], createMockOverallReport(35, 'unverified'), { maxIterations: 3 });

      expect(result.trace.terminalState).toBe('STOPPED');
      expect(result.trace.finalStopReason).toBe('insufficient_candidates');
      expect(result.trace.finalStopReason).not.toBe('invalid_decision_schema');
      const stopEvent = result.trace.events.find(e => e.state === 'COMPLETED' && e.decision === 'STOP');
      expect(stopEvent).toBeDefined();
      expect(stopEvent?.reasoning).toBe('No verified candidate alternatives available for repair.');
    });

    it('9. unverified + STOPPED state in agent loop preserves unverified baseline without claiming verified', async () => {
      const mockAiProvider: AIProvider = {
        name: 'mock_groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'STOP',
            suggestedCandidateId: null,
            reasoning: 'Cannot ground input recommendation',
            stopReason: 'unsupported'
          })
        })
      };

      const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockAiProvider });
      const envelope = createMockEnvelope();
      const initialReport = createMockOverallReport(25, 'unverified');

      const agentLoop = new TasteAuditAgentLoop({
        ai: aiOrchestrator,
        repairSvc: createDefaultMockRepairSvc(),
        evidenceSvc: { retrieveEvidence: vi.fn() } as unknown as EvidenceRetrievalService,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 25 })),
          aggregateReport: vi.fn().mockReturnValue(initialReport)
        } as unknown as CulturalGroundingAuditEngine
      });

      const result = await agentLoop.runLoop(defaultInput, [envelope], initialReport, { maxIterations: 1 });

      expect(result.trace.terminalState).toBe('STOPPED');
      expect(result.auditReport.overallScore).toBe(25);
      expect(result.auditReport.decision.status).toBe('unverified');
      expect(result.repairReport?.repairedItems.length || 0).toBe(0);
    });
  });
});
