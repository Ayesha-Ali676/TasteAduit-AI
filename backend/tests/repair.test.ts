import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepairService } from '../src/services/repair/repair.service.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { AIProvider, ChatMessage, AICompletionResult } from '../src/services/ai/ai.types.js';
import { GroqProvider } from '../src/services/ai/groq.provider.js';
import { OpenRouterProvider } from '../src/services/ai/openrouter.provider.js';
import { ItemResolutionEnvelope, ItemAuditResult } from '../src/services/orchestrator/stages.types.js';
import { ServerQlooClient } from '../src/services/qloo/qloo.client.js';
import { EvidenceService } from '../src/services/evidence/evidence.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';

describe('Stage 5: AI-Powered Repair Engine & Evidence Firewall', () => {
  // Helper to create a mock audit result
  function createMockAuditResult(overrides: Partial<ItemAuditResult> = {}): ItemAuditResult {
    return {
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
          reasons: ["[FAIL] Negative constraint 'no romance' violated."],
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
        explanation: 'Low cultural alignment (45/100) or insufficient signals against requested context.'
      },
      evidenceRefs: ['qloo:test'],
      provenance: {
        operation: 'audit_cultural_grounding',
        engineVersion: '1.0.0-deterministic',
        weights: { culturalAlignment: 0.4, contextualRelevance: 0.25, constraintCompliance: 0.2, evidenceCompleteness: 0.15 },
        auditedAt: new Date().toISOString()
      },
      ...overrides
    };
  }

  // Helper to create a mock envelope
  function createMockEnvelope(overrides: Partial<ItemResolutionEnvelope> = {}): ItemResolutionEnvelope {
    return {
      item: { id: 'it_1', name: 'Weak Movie' },
      resolution: {
        query: 'Weak Movie',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_weak',
          name: 'Weak Movie',
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
          correlationId: 'c1',
          resolutionStatus: 'resolved'
        }
      },
      evidence: {
        status: 'supported',
        entityId: 'ent_weak',
        entityName: 'Weak Movie',
        entityType: 'urn:entity:movie',
        signals: [
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_good_film',
            relatedEntityName: 'Good Crime Film',
            value: 0.92,
            tags: ['Crime', 'Thriller', 'Cult classic']
          },
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_alt_film',
            relatedEntityName: 'Alternative Noir Film',
            value: 0.88,
            tags: ['Crime', 'Mystery']
          }
        ],
        summary: { signalsCount: 2, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_1',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      },
      audit: createMockAuditResult(),
      ...overrides
    };
  }

  // Mock Provider constructor helper
  function createMockAIProvider(
    name: 'groq' | 'openrouter',
    configured: boolean,
    handler: (messages: ChatMessage[]) => Promise<AICompletionResult>
  ): AIProvider {
    return {
      name,
      isConfigured: () => configured,
      generateCompletion: handler
    };
  }

  // 1. Groq provider success
  it('1. should successfully execute Groq provider when Groq succeeds', async () => {
    const groqHandler = vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'genre_alignment',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        reasoning: 'Good Crime Film has high cultural affinity and satisfies crime thriller constraints.',
        evidenceRefs: ['qloo:affinity:ent_good_film'],
        constraintHandling: ['Complies with crime thriller requirements.'],
        confidence: 0.95
      })
    });

    const mockGroq = createMockAIProvider('groq', true, groqHandler);
    const mockOpenRouter = createMockAIProvider('openrouter', true, vi.fn());
    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq, fallbackProvider: mockOpenRouter });

    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(groqHandler).toHaveBeenCalled();
    expect(result.status).toBe('repaired');
    expect(result.providerUsed).toBe('groq');
    expect(result.selectedCandidate?.name).toBe('Good Crime Film');
    expect(result.selectedCandidate?.entityId).toBe('ent_good_film');
  });

  // 2. OpenRouter fallback
  it('2. should fallback to OpenRouter when Groq fails', async () => {
    const groqHandler = vi.fn().mockResolvedValue({
      success: false,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      error: 'HTTP 503 Provider Unavailable'
    });

    const openRouterHandler = vi.fn().mockResolvedValue({
      success: true,
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'fallback_affinity_selection',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        reasoning: 'Repaired using OpenRouter fallback with verified Qloo candidate.',
        evidenceRefs: ['qloo:affinity:ent_good_film'],
        constraintHandling: ['Exclusions satisfied.'],
        confidence: 0.90
      })
    });

    const mockGroq = createMockAIProvider('groq', true, groqHandler);
    const mockOpenRouter = createMockAIProvider('openrouter', true, openRouterHandler);
    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq, fallbackProvider: mockOpenRouter });

    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(groqHandler).toHaveBeenCalled();
    expect(openRouterHandler).toHaveBeenCalled();
    expect(result.status).toBe('repaired');
    expect(result.providerUsed).toBe('openrouter');
  });

  // 3. Both providers unavailable
  it('3. should handle both providers unavailable without crashing', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: false,
      provider: 'groq',
      model: 'llama',
      error: 'Groq timeout'
    }));

    const mockOpenRouter = createMockAIProvider('openrouter', true, vi.fn().mockResolvedValue({
      success: false,
      provider: 'openrouter',
      model: 'claude',
      error: 'OpenRouter rate limit 429'
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq, fallbackProvider: mockOpenRouter });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repair_failed');
    expect(result.repairStrategy).toBe('ai_provider_unavailable');
    expect(result.beforeAudit.overallScore).toBe(45); // Original audit preserved!
  });

  // 4. Malformed AI response
  it('4. should safely reject malformed AI response (invalid JSON)', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: 'I recommend replacing this with Good Crime Film because it is very good.' // Not JSON!
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repair_failed');
    expect(result.repairStrategy).toBe('malformed_json_response');
    expect(result.reasoning).toContain('rejected by Evidence Firewall');
  });

  // 5. Unknown candidate rejection
  it('5. should reject unknown candidate not present in verified Qloo candidate set', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'invented_recommendation',
        selectedCandidate: {
          name: 'The Godfather Part IV', // Fabricated!
          entityId: 'ent_hallucinated_godfather'
        },
        reasoning: 'An invented classic that fits the context.',
        evidenceRefs: [],
        constraintHandling: [],
        confidence: 0.99
      })
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repair_failed');
    expect(result.repairStrategy).toBe('unverified_candidate_hallucination_rejected');
    expect(result.reasoning).toContain('Evidence Firewall rejected candidate');
  });

  // 6. Unknown entity ID rejection
  it('6. should reject candidate with unknown entity ID not in backend candidate set', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'real_name_fake_id',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'fake_id_not_in_qloo' // ID mismatch!
        },
        reasoning: 'Matches name but has spoofed entity ID.',
        evidenceRefs: [],
        constraintHandling: [],
        confidence: 0.9
      })
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repair_failed');
    expect(result.repairStrategy).toBe('unverified_candidate_hallucination_rejected');
  });

  // 7. Missing evidence rejection (no candidates available)
  it('7. should return insufficient_evidence without calling AI when Qloo yields zero candidates', async () => {
    const groqHandler = vi.fn();
    const mockGroq = createMockAIProvider('groq', true, groqHandler);
    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });

    // Mock envelope with empty signals and mock Qloo client returning empty search
    const mockQloo = {
      searchCandidates: vi.fn().mockResolvedValue([])
    } as unknown as ServerQlooClient;

    const repairSvc = new RepairService({ ai: aiOrchestrator, qloo: mockQloo });
    const emptyEnvelope = createMockEnvelope({
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
          correlationId: 'ev_0',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Unverified'
        }
      }
    });

    const result = await repairSvc.repairItem(emptyEnvelope);

    expect(groqHandler).not.toHaveBeenCalled(); // AI never called!
    expect(result.status).toBe('insufficient_evidence');
    expect(result.repairStrategy).toBe('insufficient_qloo_candidates');
  });

  // 8. Invalid confidence rejection
  it('8. should reject invalid confidence numbers outside 0.0 - 1.0', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'genre_alignment',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        reasoning: 'Good candidate.',
        confidence: 1.8 // Invalid! Max is 1.0
      })
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repair_failed');
    expect(result.repairStrategy).toBe('invalid_schema_output');
  });

  // 9. AI repair skipped for strong recommendation
  it('9. should skip AI repair for strongly supported recommendations', async () => {
    const groqHandler = vi.fn();
    const mockGroq = createMockAIProvider('groq', true, groqHandler);
    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });

    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const strongEnvelope = createMockEnvelope({
      audit: createMockAuditResult({
        overallScore: 92,
        decision: {
          status: 'supported',
          label: 'Culturally Grounded (Supported)',
          explanation: 'Strong empirical grounding.'
        },
        dimensions: {
          culturalAlignment: { name: 'culturalAlignment', score: 95, weight: 0.4, weightedScore: 38, classification: 'Supported', reasons: [], evidenceRefs: [] },
          contextualRelevance: { name: 'contextualRelevance', score: 85, weight: 0.25, weightedScore: 21.25, classification: 'Supported', reasons: [], evidenceRefs: [] },
          constraintCompliance: { name: 'constraintCompliance', score: 100, weight: 0.2, weightedScore: 20, classification: 'Supported', reasons: [], evidenceRefs: [] },
          evidenceCompleteness: { name: 'evidenceCompleteness', score: 90, weight: 0.15, weightedScore: 13.5, classification: 'Supported', reasons: [], evidenceRefs: [] }
        }
      })
    });

    const result = await repairSvc.repairItem(strongEnvelope);

    expect(groqHandler).not.toHaveBeenCalled(); // AI skipped!
    expect(result.status).toBe('no_repair');
    expect(result.repairStrategy).toBe('no_repair_required');
    expect(result.scoreDelta).toBe(0);
  });

  // 10. insufficient_evidence behavior
  it('10. should handle explicit AI insufficient_evidence response cleanly', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'insufficient_evidence',
        strategy: 'no_suitable_match_found',
        reasoning: 'None of the verified candidates satisfy the requested negative constraint.',
        evidenceRefs: [],
        constraintHandling: ['No candidate satisfied exclusion.'],
        confidence: 0.85
      })
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('insufficient_evidence');
    expect(result.repairStrategy).toBe('no_suitable_match_found');
    expect(result.selectedCandidate).toBeUndefined();
  });

  // 11. Repaired candidate goes through deterministic re-audit
  it('11. should pass repaired candidate through deterministic re-audit to calculate afterScore and delta', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'affinity_upgrade',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        reasoning: 'High affinity crime film.',
        confidence: 0.95
      })
    }));

    // Mock evidence retrieval for repaired entity
    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        entityId: 'ent_good_film',
        entityName: 'Good Crime Film',
        entityType: 'urn:entity:movie',
        signals: [
          { signalType: 'taste_affinity', relatedEntityName: 'Reservoir Dogs', value: 0.95, tags: ['Crime', 'Thriller'] },
          { signalType: 'cultural_tag', relatedEntityName: 'Cult classic' }
        ],
        summary: { signalsCount: 2, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'retrieve_taste_evidence',
          correlationId: 'rep_ev',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Supported'
        }
      })
    } as unknown as EvidenceService;

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator, evidence: mockEvidenceSvc });
    const envelope = createMockEnvelope(); // beforeAudit score: 45

    const result = await repairSvc.repairItem(envelope, { constraints: ['crime thriller'] });

    expect(result.status).toBe('repaired');
    expect(result.afterAudit).toBeDefined();
    expect(result.afterAudit?.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.scoreDelta).toBe(result.afterAudit!.overallScore - 45);
    expect(result.verifiedImprovement).toBe(true);
  });

  // 12. AI cannot override audit score
  it('12. should calculate final score strictly from AuditEngine, ignoring any AI claimed score', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'score_claim_attempt',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        claimedScore: 100, // AI tries to claim 100
        reasoning: 'I give this 100/100.',
        confidence: 0.9
      })
    }));

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator });
    const envelope = createMockEnvelope();

    const result = await repairSvc.repairItem(envelope);

    expect(result.afterAudit?.overallScore).toBeDefined();
    // Verify afterAudit comes from deterministic scoring formula (not 100 claimed by AI)
    expect(result.afterAudit?.provenance.operation).toBe('cultural_grounding_audit');
    expect(result.afterAudit?.provenance.source).toBe('tasteaudit');
  });

  // 13. AI cannot create unsupported recommendation if re-audit fails
  it('13. should mark verifiedImprovement false if repaired candidate scores lower or equal on re-audit', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'poor_candidate_selection',
        selectedCandidate: {
          name: 'Alternative Noir Film',
          entityId: 'ent_alt_film'
        },
        reasoning: 'Selected alternative.',
        confidence: 0.5
      })
    }));

    // Mock evidence with empty signals (insufficient evidence)
    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'insufficient_evidence',
        entityId: 'ent_alt_film',
        entityName: 'Alternative Noir Film',
        entityType: 'urn:entity:movie',
        signals: [],
        summary: { signalsCount: 0, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: 'none',
          operation: 'retrieve_taste_evidence',
          correlationId: 'ev_empty',
          retrievedAt: new Date().toISOString(),
          queryMetadata: {},
          classification: 'Unverified'
        }
      })
    } as unknown as EvidenceService;

    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });
    const repairSvc = new RepairService({ ai: aiOrchestrator, evidence: mockEvidenceSvc });
    const envelope = createMockEnvelope({ audit: createMockAuditResult({ overallScore: 65 }) });

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('repaired');
    expect(result.afterAudit?.decision.status).toBe('insufficient_evidence');
    expect(result.verifiedImprovement).toBe(false);
    expect(result.scoreDelta).toBeLessThan(0);
  });

  // 14. Qloo API failure does not crash the application
  it('14. should handle Qloo API failure during candidate retrieval without crashing', async () => {
    const mockQloo = {
      searchCandidates: vi.fn().mockRejectedValue(new Error('Qloo Network Timeout 504'))
    } as unknown as ServerQlooClient;

    const mockGroq = createMockAIProvider('groq', true, vi.fn());
    const aiOrchestrator = new AIOrchestratorProvider({ primaryProvider: mockGroq });

    const repairSvc = new RepairService({ ai: aiOrchestrator, qloo: mockQloo });
    // Envelope with no existing affinity signals to force searchCandidates call
    const envelope = createMockEnvelope({ evidence: undefined });

    const result = await repairSvc.repairItem(envelope);

    expect(result.status).toBe('insufficient_evidence');
    expect(result.beforeAudit).toBeDefined(); // Original audit preserved!
  });

  // 15. Timeout handling on AI requests
  it('15. should enforce timeout handling on AI provider requests', async () => {
    const groqProvider = new GroqProvider({
      apiKey: 'test-key',
      timeoutMs: 50,
      endpoint: 'https://example.com/slow'
    });

    // Mock global fetch to simulate delay longer than timeout
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted due to timeout');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    try {
      const result = await groqProvider.generateCompletion([
        { role: 'user', content: 'hello' }
      ], { timeoutMs: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 16. Retry / Fallback boundaries (Groq -> OpenRouter -> safe termination)
  it('16. should enforce single fallback boundary from Groq to OpenRouter without infinite loop', async () => {
    const groqCall = vi.fn().mockResolvedValue({ success: false, provider: 'groq', error: 'Fail 1' });
    const openRouterCall = vi.fn().mockResolvedValue({ success: false, provider: 'openrouter', error: 'Fail 2' });

    const mockGroq = createMockAIProvider('groq', true, groqCall);
    const mockOpenRouter = createMockAIProvider('openrouter', true, openRouterCall);

    const orchestrator = new AIOrchestratorProvider({
      primaryProvider: mockGroq,
      fallbackProvider: mockOpenRouter
    });

    const result = await orchestrator.executeCompletion([{ role: 'user', content: 'test' }]);

    expect(groqCall).toHaveBeenCalledTimes(1);
    expect(openRouterCall).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('AI_REPAIR_UNAVAILABLE');
  });

  // Orchestrator Integration Test
  it('should execute full Stage 1-5 pipeline when enableRepair is true', async () => {
    const mockGroq = createMockAIProvider('groq', true, vi.fn().mockResolvedValue({
      success: true,
      provider: 'groq',
      model: 'llama',
      content: JSON.stringify({
        repairStatus: 'repaired',
        strategy: 'repair_recommendation',
        selectedCandidate: {
          name: 'Good Crime Film',
          entityId: 'ent_good_film'
        },
        reasoning: 'Repaired item.',
        confidence: 0.95
      })
    }));

    const mockEvidenceSvc = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        status: 'supported',
        entityId: 'ent_good_film',
        entityName: 'Good Crime Film',
        entityType: 'urn:entity:movie',
        signals: [{ signalType: 'cultural_tag', relatedEntityName: 'Cult classic' }],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: { source: 'qloo', endpoint: '/test', operation: 'test', retrievedAt: new Date().toISOString(), correlationId: 'c', classification: 'Supported' }
      })
    } as unknown as EvidenceService;

    const repairSvc = new RepairService({
      ai: new AIOrchestratorProvider({ primaryProvider: mockGroq }),
      evidence: mockEvidenceSvc
    });

    const pipelineOrchestrator = new TasteAuditOrchestrator(undefined, undefined, undefined, repairSvc);

    const result = await pipelineOrchestrator.executeRepairPipeline({
      rawRecommendation: 'Weak Concept'
    });

    expect(result.stagesExecuted).toEqual(['PARSE', 'RESOLVE', 'RETRIEVE', 'AUDIT', 'REPAIR']);
    expect(result.repairReport).toBeDefined();
    expect(result.repairReport?.repairedItems.length).toBeGreaterThan(0);
  }, 15000);
});
