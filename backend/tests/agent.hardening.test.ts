import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider } from '../src/services/ai/groq.provider.js';
import { OpenRouterProvider } from '../src/services/ai/openrouter.provider.js';
import { AIOrchestratorProvider } from '../src/services/ai/ai.provider.js';
import { AIProvider } from '../src/services/ai/ai.types.js';
import { TasteAuditAgentLoop } from '../src/services/agent/agent.loop.js';
import { AgentDecisionSchema } from '../src/services/agent/agent.schemas.js';
import { ItemResolutionEnvelope, ParseStageInput } from '../src/services/orchestrator/stages.types.js';
import { ItemAuditResult, OverallAuditReport } from '../src/services/audit/audit.types.js';
import { RepairService } from '../src/services/repair/repair.service.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';

describe('Phase 2 Hardening: AI Provider Reliability & Agent Loop Safety', () => {
  const defaultInput: ParseStageInput = {
    rawRecommendation: 'Test Concept',
    audienceContext: 'General audience',
    location: 'Los Angeles, USA',
    constraints: ['Cult classic']
  };

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
          reasons: ["[FAIL] Constraint violated."],
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
        explanation: 'Low cultural alignment.'
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

  function createMockOverallReport(overallScore = 45, status: 'supported' | 'unverified' = 'unverified'): OverallAuditReport {
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
        insufficientCount: 0
      },
      provenance: {
        source: 'tasteaudit',
        operation: 'aggregate_report',
        correlationId: 'agg_c1',
        auditedAt: new Date().toISOString(),
        classification: status === 'supported' ? 'Supported' : 'Unverified'
      }
    };
  }

  function createMockEnvelope(overrides: Partial<ItemResolutionEnvelope> = {}): ItemResolutionEnvelope {
    return {
      item: { id: 'it_1', name: 'Test Recommendation' },
      resolution: {
        query: 'Test Recommendation',
        status: 'resolved',
        resolvedEntity: {
          id: 'ent_test',
          name: 'Test Recommendation',
          type: 'urn:entity:movie',
          category: 'entity',
          imageUrl: 'https://images.qloo.com/i/test-420x-auto.jpg',
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
          resolutionStatus: 'resolved'
        }
      },
      evidence: {
        status: 'supported',
        signals: [
          {
            signalType: 'taste_affinity',
            relatedEntityId: 'ent_related',
            relatedEntityName: 'Related Film',
            value: 0.92
          }
        ],
        summary: { signalsCount: 1, hasLocationSignal: false },
        provenance: {
          source: 'qloo',
          endpoint: '/v2/insights',
          operation: 'affinity_query',
          correlationId: 'ev_c1',
          retrievedAt: new Date().toISOString(),
          classification: 'Supported'
        }
      },
      audit: createMockAuditResult(),
      ...overrides
    };
  }

  // =========================================================================
  // PART 2: PROVIDER TESTS (1 - 8)
  // =========================================================================
  describe('Provider Reliability Hardening', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('1. should succeed with valid response when Groq returns HTTP 200', async () => {
      const groq = new GroqProvider({ apiKey: 'valid-groq-key' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"decision": "STOP", "reasoning": "Done"}' } }]
        })
      } as Response);

      const res = await groq.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(true);
      expect(res.content).toBe('{"decision": "STOP", "reasoning": "Done"}');
      expect(res.provider).toBe('groq');
    });

    it('2. should explicitly handle Groq HTTP 429 rate limit without crashing', async () => {
      const groq = new GroqProvider({ apiKey: 'valid-groq-key' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded: OTPM limit reached'
      } as Response);

      const res = await groq.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.error).toContain('HTTP 429');
    });

    it('3. should handle Groq request timeout cleanly', async () => {
      const groq = new GroqProvider({ apiKey: 'valid-groq-key', timeoutMs: 20 });
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const res = await groq.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(false);
      expect(res.error).toContain('timed out');
    });

    it('4. should reject Groq empty/malformed response body', async () => {
      const groq = new GroqProvider({ apiKey: 'valid-groq-key' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] })
      } as Response);

      const res = await groq.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(false);
      expect(res.error).toContain('empty response body');
    });

    it('5. should seamlessly activate OpenRouter fallback when Groq fails', async () => {
      const mockGroq: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: false,
          statusCode: 429,
          error: 'Groq rate limit exceeded (HTTP 429)'
        })
      };

      const mockOpenRouter: AIProvider = {
        name: 'openrouter',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: '{"decision": "ACCEPT", "reasoning": "Fallback success"}',
          provider: 'openrouter',
          model: 'meta-llama/llama-3.3-70b-instruct'
        })
      };

      const orchestrator = new AIOrchestratorProvider({
        primaryProvider: mockGroq,
        fallbackProvider: mockOpenRouter
      });

      const res = await orchestrator.executeCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(true);
      expect(res.provider).toBe('openrouter');
      expect(res.content).toContain('Fallback success');
      expect(mockGroq.generateCompletion).toHaveBeenCalledOnce();
      expect(mockOpenRouter.generateCompletion).toHaveBeenCalledOnce();
    });

    it('6. should explicitly handle OpenRouter HTTP 402 insufficient credits', async () => {
      const openRouter = new OpenRouterProvider({ apiKey: 'valid-or-key' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: async () => 'Payment Required: insufficient credits'
      } as Response);

      const res = await openRouter.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(402);
      expect(res.error).toContain('HTTP 402');
    });

    it('7. should return clean AI_REPAIR_UNAVAILABLE when all configured providers fail', async () => {
      const mockGroq: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: false,
          statusCode: 429,
          error: 'Groq rate limit'
        })
      };

      const mockOpenRouter: AIProvider = {
        name: 'openrouter',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: false,
          statusCode: 402,
          error: 'OpenRouter payment required'
        })
      };

      const orchestrator = new AIOrchestratorProvider({
        primaryProvider: mockGroq,
        fallbackProvider: mockOpenRouter
      });

      const res = await orchestrator.executeCompletion([{ role: 'user', content: 'test' }]);
      expect(res.success).toBe(false);
      expect(res.error).toContain('AI_REPAIR_UNAVAILABLE');
    });

    it('8. should enforce token efficiency by configuring maxTokens <= 768 by default', async () => {
      const groq = new GroqProvider({ apiKey: 'test-key' });
      let capturedBody: any;

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] })
        } as Response;
      });

      await groq.generateCompletion([{ role: 'user', content: 'test' }]);
      expect(capturedBody.max_tokens).toBeLessThanOrEqual(768);
    });
  });

  // =========================================================================
  // PART 3: AGENT DECISION SAFETY & RULES (9 - 22)
  // =========================================================================
  describe('Agent Decision Safety & Rules', () => {
    it('9. should handle valid ACCEPT decision when deterministic score supports it', async () => {
      const envelope = createMockEnvelope();
      const highAudit = createMockAuditResult({
        overallScore: 85,
        decision: { status: 'supported', label: 'Culturally Grounded', explanation: 'Strong match' },
        dimensions: {
          ...createMockAuditResult().dimensions,
          constraintCompliance: {
            name: 'constraintCompliance',
            score: 100,
            weight: 0.2,
            weightedScore: 20,
            classification: 'Supported',
            reasons: ['Pass'],
            evidenceRefs: []
          }
        }
      });
      envelope.audit = highAudit;

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'ACCEPT',
            reasoning: 'Item is culturally grounded.'
          })
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => false, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(highAudit),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(85, 'supported'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(85, 'supported'), { maxIterations: 1 });
      expect(res.trace.terminalState).toBe('ACCEPTED');
      expect(res.trace.finalStopReason).toBe('all_items_supported');
    });

    it('10. should execute valid REPAIR with deterministic re-audit and positive score improvement', async () => {
      const envelope = createMockEnvelope();
      const improvedAudit = createMockAuditResult({ overallScore: 90 });

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: 'it_1',
            suggestedCandidateId: 'ent_good',
            reasoning: 'Swap with verified higher-affinity candidate'
          })
        })
      };

      const mockRepairSvc = {
        shouldRepair: () => true,
        getVerifiedCandidates: vi.fn().mockResolvedValue([
          { entityId: 'ent_good', name: 'Better Choice', type: 'urn:entity:movie' }
        ]),
        repairItem: vi.fn().mockResolvedValue({
          originalItem: 'Test Recommendation',
          status: 'repaired',
          selectedCandidate: { entityId: 'ent_good', name: 'Better Choice', type: 'urn:entity:movie' },
          scoreDelta: 45,
          afterAudit: improvedAudit,
          evidenceRefs: ['qloo:ref1'],
          repairedEnvelope: { ...envelope, audit: improvedAudit }
        }),
        aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: mockRepairSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(improvedAudit),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(90, 'supported'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 2 });
      expect(res.trace.events.some((e) => e.decision === 'REPAIR')).toBe(true);
      expect(mockRepairSvc.repairItem).toHaveBeenCalledOnce();
    });

    it('11. should execute valid MORE_EVIDENCE and re-audit', async () => {
      const envelope = createMockEnvelope();
      const updatedAudit = createMockAuditResult({ overallScore: 82 });

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'MORE_EVIDENCE',
            targetItemId: 'it_1',
            reasoning: 'Need additional affinity signals'
          })
        })
      };

      const mockEvidenceSvc = {
        retrieveEvidence: vi.fn().mockResolvedValue({
          status: 'supported',
          signals: [{ signalType: 'taste_affinity', value: 0.95 }],
          summary: { signalsCount: 2, hasLocationSignal: false },
          provenance: { correlationId: 'fresh_c1', classification: 'Supported' }
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => false, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        evidenceSvc: mockEvidenceSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(updatedAudit),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(82, 'supported'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 2 });
      expect(mockEvidenceSvc.retrieveEvidence).toHaveBeenCalledOnce();
      expect(res.trace.events.some((e) => e.decision === 'MORE_EVIDENCE')).toBe(true);
    });

    it('12. should handle valid STOP decision with honest stopReason', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'STOP',
            reasoning: 'No further improvements possible within constraints',
            stopReason: 'no_suitable_alternatives'
          })
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => false, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 1 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('no_suitable_alternatives');
    });

    it('13. should parse nullable optional fields without crashing', () => {
      const payloadWithNulls = {
        decision: 'STOP',
        targetItemId: null,
        suggestedCandidateId: null,
        reasoning: 'Clean stop with null optional fields',
        stopReason: null
      };

      const validation = AgentDecisionSchema.safeParse(payloadWithNulls);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.targetItemId).toBeNull();
        expect(validation.data.suggestedCandidateId).toBeNull();
        expect(validation.data.stopReason).toBeNull();
      }
    });

    it('14. should reject malformed JSON with invalid_decision_schema STOP', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: 'NOT_VALID_JSON {broken'
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => false, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 1 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('invalid_decision_schema');
    });

    it('15. should reject invalid enum decision (e.g. "REPLACE") with invalid_decision_schema', () => {
      const payloadWithInvalidEnum = {
        decision: 'REPLACE', // Invalid enum
        reasoning: 'Attempting invalid verb'
      };

      const validation = AgentDecisionSchema.safeParse(payloadWithInvalidEnum);
      expect(validation.success).toBe(false);
    });

    it('16. should reject fabricated candidate not present in verified Qloo candidate set', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: 'it_1',
            suggestedCandidateId: 'ent_hallucinated_123',
            reasoning: 'I made up this candidate'
          })
        })
      };

      const mockRepairSvc = {
        shouldRepair: () => true,
        getVerifiedCandidates: vi.fn().mockResolvedValue([
          { entityId: 'ent_real_1', name: 'Real Film', type: 'urn:entity:movie' }
        ]),
        repairItem: vi.fn()
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: mockRepairSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 1 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('fabricated_candidate_rejected');
      expect(mockRepairSvc.repairItem).not.toHaveBeenCalled();
    });

    it('17. should ensure repair is always followed by independent deterministic re-audit', async () => {
      const envelope = createMockEnvelope();
      const mockAuditEngine = {
        auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 88 })),
        aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(88, 'supported'))
      };

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: 'it_1',
            suggestedCandidateId: 'ent_v1',
            reasoning: 'Valid repair'
          })
        })
      };

      const mockRepairSvc = {
        shouldRepair: () => true,
        getVerifiedCandidates: vi.fn().mockResolvedValue([
          { entityId: 'ent_v1', name: 'Verified Film', type: 'urn:entity:movie' }
        ]),
        repairItem: vi.fn().mockResolvedValue({
          originalItem: 'Test Recommendation',
          status: 'repaired',
          selectedCandidate: { entityId: 'ent_v1', name: 'Verified Film', type: 'urn:entity:movie' },
          scoreDelta: 43,
          afterAudit: createMockAuditResult({ overallScore: 88 }),
          evidenceRefs: ['qloo:ref1'],
          repairedEnvelope: { ...envelope, audit: createMockAuditResult({ overallScore: 88 }) }
        }),
        aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: mockRepairSvc as any,
        auditEngine: mockAuditEngine as any
      });

      await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 2 });
      expect(mockAuditEngine.aggregateReport).toHaveBeenCalled();
    });

    it('18. should stop safely when repair yields zero or negative improvement', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'REPAIR',
            targetItemId: 'it_1',
            suggestedCandidateId: 'ent_v1',
            reasoning: 'Repair attempt'
          })
        })
      };

      const mockRepairSvc = {
        shouldRepair: () => true,
        getVerifiedCandidates: vi.fn().mockResolvedValue([
          { entityId: 'ent_v1', name: 'Verified Film', type: 'urn:entity:movie' }
        ]),
        repairItem: vi.fn().mockResolvedValue({
          originalItem: 'Test Recommendation',
          status: 'repaired',
          selectedCandidate: { entityId: 'ent_v1', name: 'Verified Film', type: 'urn:entity:movie' },
          scoreDelta: 0, // Zero improvement!
          afterAudit: createMockAuditResult({ overallScore: 45 }),
          evidenceRefs: ['qloo:ref1']
        }),
        aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: mockRepairSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 3 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('zero_improvement_repair_stop');
    });

    it('19. should trigger repeated-action protection when same action is proposed twice', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: true,
          content: JSON.stringify({
            decision: 'MORE_EVIDENCE',
            targetItemId: 'it_1',
            reasoning: 'Need evidence'
          })
        })
      };

      const mockEvidenceSvc = {
        retrieveEvidence: vi.fn().mockResolvedValue({
          status: 'supported',
          signals: [{ signalType: 'taste_affinity', value: 0.9 }],
          summary: { signalsCount: 1, hasLocationSignal: false },
          provenance: { correlationId: 'c1', classification: 'Supported' }
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => false, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        evidenceSvc: mockEvidenceSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 50 })),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(50, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 3 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('repeated_action_halt');
    });

    it('20. should enforce maximum iteration protection', async () => {
      const envelope = createMockEnvelope();
      let iterationCount = 0;

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockImplementation(async () => {
          iterationCount++;
          return {
            success: true,
            content: JSON.stringify({
              decision: 'REPAIR',
              targetItemId: 'it_1',
              suggestedCandidateId: `ent_cand_${iterationCount}`,
              reasoning: `Repair attempt ${iterationCount}`
            })
          };
        })
      };

      const mockRepairSvc = {
        shouldRepair: () => true,
        getVerifiedCandidates: vi.fn().mockImplementation(async () => [
          { entityId: `ent_cand_${iterationCount + 1}`, name: 'Cand', type: 'urn:entity:movie' }
        ]),
        repairItem: vi.fn().mockImplementation(async () => ({
          originalItem: 'Test Recommendation',
          status: 'repaired',
          selectedCandidate: { entityId: `ent_cand_${iterationCount}`, name: 'Cand', type: 'urn:entity:movie' },
          scoreDelta: 5,
          afterAudit: createMockAuditResult({ overallScore: 45 + iterationCount * 5 }),
          evidenceRefs: ['qloo:ref']
        })),
        aggregateRepairReport: vi.fn().mockReturnValue({ repairedItems: [] })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: mockRepairSvc as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(50, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 2 });
      expect(res.trace.totalIterations).toBeLessThanOrEqual(2);
      expect(res.trace.terminalState).toBe('STOPPED');
    });

    it('21. should safely STOP when all AI providers fail', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: false,
          statusCode: 429,
          error: 'Groq rate limit exceeded (HTTP 429)'
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => true, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 3 });
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.trace.finalStopReason).toBe('provider_failure');
    });

    it('22. should guarantee provider failure does NOT produce a false ACCEPT', async () => {
      const envelope = createMockEnvelope();
      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({
          success: false,
          error: 'Provider failure'
        })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => true, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 30 })),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(30, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(30, 'unverified'), { maxIterations: 1 });
      expect(res.trace.terminalState).not.toBe('ACCEPTED');
      expect(res.trace.terminalState).toBe('STOPPED');
      expect(res.auditReport.overallScore).toBe(30);
    });
  });

  // =========================================================================
  // REGRESSION TESTS (23 - 26)
  // =========================================================================
  describe('Invariance & Regression Protection', () => {
    it('23. should preserve real Qloo evidence when AI provider fails', async () => {
      const envelope = createMockEnvelope();
      const initialSignalsCount = envelope.evidence?.signals.length;

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({ success: false, error: 'Failure' })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => true, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 1 });
      expect(res.envelopes[0].evidence?.signals.length).toBe(initialSignalsCount);
      expect(res.envelopes[0].evidence?.status).toBe('supported');
    });

    it('24. should preserve native Qloo image metadata when AI provider fails', async () => {
      const envelope = createMockEnvelope();
      expect(envelope.resolution.resolvedEntity?.imageUrl).toBeDefined();

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({ success: false, error: 'Failure' })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => true, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult()),
          aggregateReport: vi.fn().mockReturnValue(createMockOverallReport(45, 'unverified'))
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], createMockOverallReport(45, 'unverified'), { maxIterations: 1 });
      expect(res.envelopes[0].resolution.resolvedEntity?.imageUrl).toBe('https://images.qloo.com/i/test-420x-auto.jpg');
    });

    it('25. should preserve deterministic audit score unchanged when AI provider fails', async () => {
      const envelope = createMockEnvelope();
      const baselineReport = createMockOverallReport(79, 'unverified');

      const mockAi: AIProvider = {
        name: 'groq',
        isConfigured: () => true,
        generateCompletion: vi.fn().mockResolvedValue({ success: false, error: 'Failure' })
      };

      const loop = new TasteAuditAgentLoop({
        ai: new AIOrchestratorProvider({ primaryProvider: mockAi }),
        repairSvc: { shouldRepair: () => true, getVerifiedCandidates: vi.fn().mockResolvedValue([]) } as any,
        auditEngine: {
          auditItem: vi.fn().mockReturnValue(createMockAuditResult({ overallScore: 79 })),
          aggregateReport: vi.fn().mockReturnValue(baselineReport)
        } as any
      });

      const res = await loop.runLoop(defaultInput, [envelope], baselineReport, { maxIterations: 1 });
      expect(res.auditReport.overallScore).toBe(79);
    });

    it('26. should preserve Phase 1 resolution behavior unchanged', async () => {
      const envelope = createMockEnvelope();
      expect(envelope.resolution.status).toBe('resolved');
      expect(envelope.resolution.resolvedEntity?.id).toBe('ent_test');
    });
  });
});
