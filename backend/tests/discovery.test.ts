import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationParser } from '../src/services/orchestrator/parser.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { ServerQlooClient } from '../src/services/qloo/qloo.client.js';
import { NormalizedCandidate } from '../src/services/qloo/qloo.types.js';
import { TasteAuditOrchestrator } from '../src/services/orchestrator/orchestrator.service.js';
import { EvidenceRetrievalService } from '../src/services/evidence/evidence.service.js';
import { CulturalGroundingAuditEngine } from '../src/services/audit/audit.service.js';
import { RepairService } from '../src/services/repair/repair.service.js';

describe('Natural-Language Discovery Intent vs Explicit Entity Resolution', () => {
  describe('Step 6.1: Parser Distinction — Discovery Requests', () => {
    it('1. should NOT parse "I want something interesting to watch tonight" as the entire sentence', () => {
      const raw = 'I want something interesting to watch tonight';
      const parsed = RecommendationParser.parse({ rawRecommendation: raw });

      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.name).not.toBe(raw);
      expect(item.name.toLowerCase()).not.toBe(raw.toLowerCase());
      expect(item.isDiscovery).toBe(true);
      expect(item.category).toBe('movie');
      expect(item.discoveryIntent?.domain).toBe('movie');
    });

    it('2. should NOT parse "My friend loves old movies. What would you recommend?" as the entire sentence', () => {
      const raw = 'My friend loves old movies. What would you recommend?';
      const parsed = RecommendationParser.parse({ rawRecommendation: raw });

      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.name).not.toBe(raw);
      expect(item.name.toLowerCase()).not.toBe(raw.toLowerCase());
      expect(item.isDiscovery).toBe(true);
      expect(item.category).toBe('movie');
      expect(item.name).toBe('Old Movies');
    });

    it('3. should NOT parse "Find me somewhere nice for dinner with friends" as the entire sentence', () => {
      const raw = 'Find me somewhere nice for dinner with friends';
      const parsed = RecommendationParser.parse({ rawRecommendation: raw });

      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.name).not.toBe(raw);
      expect(item.name.toLowerCase()).not.toBe(raw.toLowerCase());
      expect(item.isDiscovery).toBe(true);
      expect(item.category).toBe('place');
      expect(item.name).toBe('Dinner Restaurant');
      expect(parsed.audienceContext).toBe('Friends');
    });

    it('4. should NOT parse "I want relaxing music while studying" as the entire sentence', () => {
      const raw = 'I want relaxing music while studying';
      const parsed = RecommendationParser.parse({ rawRecommendation: raw });

      expect(parsed.items).toHaveLength(1);
      const item = parsed.items[0];
      expect(item.name).not.toBe(raw);
      expect(item.name.toLowerCase()).not.toBe(raw.toLowerCase());
      expect(item.isDiscovery).toBe(true);
      expect(item.category).toBe('music');
      expect(item.name).toBe('Relaxing Music');
    });
  });

  describe('Step 6.2: Parser Distinction — Explicit Entities', () => {
    it('5. should parse "Dishoom" as an explicit entity', () => {
      const parsed = RecommendationParser.parse({ rawRecommendation: 'Dishoom' });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Dishoom');
      expect(parsed.items[0].isDiscovery).toBeFalsy();
    });

    it('6. should parse "Pulp Fiction" as an explicit entity', () => {
      const parsed = RecommendationParser.parse({ rawRecommendation: 'Pulp Fiction' });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Pulp Fiction');
      expect(parsed.items[0].isDiscovery).toBeFalsy();
    });

    it('7. should parse "Radiohead" as an explicit entity', () => {
      const parsed = RecommendationParser.parse({ rawRecommendation: 'Radiohead' });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Radiohead');
      expect(parsed.items[0].isDiscovery).toBeFalsy();
    });

    it('8. should parse "Recommend Dishoom for young professionals" extracting clean entity Dishoom', () => {
      const parsed = RecommendationParser.parse({ rawRecommendation: 'Recommend Dishoom for young professionals' });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Dishoom');
      expect(parsed.items[0].isDiscovery).toBeFalsy();
    });
  });

  describe('Step 6.3: Resolution & Candidate Sourcing', () => {
    let mockClient: ServerQlooClient;
    let resolutionSvc: EntityResolutionService;

    beforeEach(() => {
      mockClient = {
        searchCandidates: vi.fn(),
        getInsights: vi.fn()
      } as unknown as ServerQlooClient;
      resolutionSvc = new EntityResolutionService(mockClient);
    });

    it('should resolve explicit entity "Dishoom" using standard exact-match flow', async () => {
      const candidate: NormalizedCandidate = {
        id: 'ent_dishoom_1',
        name: 'Dishoom',
        type: 'urn:entity:place',
        category: 'entity',
        popularity: 0.95,
        tags: ['London', 'Indian Cuisine'],
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValueOnce([candidate]);

      const res = await resolutionSvc.resolve('Dishoom', {
        location: 'London, UK',
        categoryHint: 'place'
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedEntity?.id).toBe('ent_dishoom_1');
      expect(res.resolvedEntity?.name).toBe('Dishoom');
      expect(res.provenance.operation).toBe('resolve_entity');
    });

    it('should resolve natural-language discovery request using Qloo candidate discovery', async () => {
      const candidate: NormalizedCandidate = {
        id: 'ent_classic_film_1',
        name: 'Casablanca',
        type: 'urn:entity:movie',
        category: 'entity',
        popularity: 0.98,
        tags: ['Classic Cinema', 'Drama', 'Romance'],
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValue([candidate]);

      const parsed = RecommendationParser.parse({
        rawRecommendation: 'My friend loves old movies. What would you recommend?',
        audienceContext: 'Someone who enjoys classic cinema',
        location: 'New York, USA',
        constraints: ['Prefer culturally recognized older films']
      });

      const res = await resolutionSvc.resolve(parsed.items[0].name, {
        categoryHint: parsed.items[0].category,
        location: parsed.location,
        audience: parsed.audienceContext,
        constraints: parsed.constraints,
        isDiscovery: parsed.items[0].isDiscovery,
        discoveryIntent: parsed.items[0].discoveryIntent
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedEntity?.id).toBe('ent_classic_film_1');
      expect(res.resolvedEntity?.name).toBe('Casablanca');
      expect(res.provenance.operation).toBe('resolve_discovery_entity');
      expect(res.provenance.classification).toBe('Supported');
    });

    it('Safety Test: should safely fail on unknown / nonsensical discovery request without hallucinating', async () => {
      // Qloo returns zero candidates for nonsense
      vi.mocked(mockClient.searchCandidates).mockResolvedValue([]);

      const parsed = RecommendationParser.parse({
        rawRecommendation: 'I want blurgle zork globber tonight'
      });

      const res = await resolutionSvc.resolve(parsed.items[0].name, {
        categoryHint: parsed.items[0].category,
        isDiscovery: parsed.items[0].isDiscovery,
        discoveryIntent: parsed.items[0].discoveryIntent
      });

      expect(res.status).toBe('unresolved');
      expect(res.resolvedEntity).toBeUndefined();
      expect(res.candidates).toHaveLength(0);
      expect(res.derivedConfidence).toBe(0);
      expect(res.provenance.classification).toBe('Unverified');
      expect(res.reason).toContain('Zero matching entities');
    });

    it('Safety Test: full pipeline with nonsensical discovery query safely returns 2/100 baseline', async () => {
      vi.mocked(mockClient.searchCandidates).mockResolvedValue([]);

      const mockEvidenceSvc = {
        retrieveEvidence: vi.fn()
      } as unknown as EvidenceRetrievalService;

      const orchestrator = new TasteAuditOrchestrator(
        resolutionSvc,
        mockEvidenceSvc,
        new CulturalGroundingAuditEngine(),
        new RepairService(mockClient)
      );

      const result = await orchestrator.executePipeline({
        rawRecommendation: 'I want blurgle zork globber tonight',
        constraints: ['Must be authentic']
      });

      expect(result.status).toBe('partial_pipeline');
      expect(result.resolutionSummary?.unresolvedCount).toBe(1);
      expect(result.resolutionSummary?.resolvedCount).toBe(0);
      expect(result.auditReport?.decision.status).toBe('insufficient_evidence');
      expect(result.auditReport?.overallScore).toBe(2);
      // Evidence retrieval safely abstained
      expect(mockEvidenceSvc.retrieveEvidence).not.toHaveBeenCalled();
    });
  });
});
