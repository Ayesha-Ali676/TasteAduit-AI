import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationParser } from '../src/services/orchestrator/parser.js';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { ServerQlooClient } from '../src/services/qloo/qloo.client.js';
import { NormalizedCandidate } from '../src/services/qloo/qloo.types.js';

describe('Multi-Scenario Parity & Generic Intelligence Hardening', () => {
  describe('Generic Natural Language Intent Parsing', () => {
    it('should parse discrete items from structured multi-line lists with bullet markers', () => {
      const res = RecommendationParser.parse({
        rawRecommendation: '1. Pulp Fiction\n2. Reservoir Dogs\n- Jackie Brown'
      });
      expect(res.items).toHaveLength(3);
      expect(res.items[0].name).toBe('Pulp Fiction');
      expect(res.items[1].name).toBe('Reservoir Dogs');
      expect(res.items[2].name).toBe('Jackie Brown');
    });

    it('should extract target entities from conversational question phrases without hardcoded strings', () => {
      const r1 = RecommendationParser.parse({ rawRecommendation: 'Should this venue book Artist X?' });
      expect(r1.items).toHaveLength(1);
      expect(r1.items[0].name).toBe('Artist X');

      const r2 = RecommendationParser.parse({ rawRecommendation: 'Should I ditch Vinyl Cafés' });
      expect(r2.items).toHaveLength(1);
      expect(r2.items[0].name).toBe('Vinyl Cafés');

      const r3 = RecommendationParser.parse({ rawRecommendation: 'Should we visit Ozone Coffee Roasters?' });
      expect(r3.items).toHaveLength(1);
      expect(r3.items[0].name).toBe('Ozone Coffee Roasters');
    });

    it('should extract disjunctions ("A or B") and infer domain from context trailer', () => {
      const res = RecommendationParser.parse({
        rawRecommendation: 'Book Underground Inc or Pulp Fiction for an indie cultural cinema and alternative music retrospective showcase'
      });
      expect(res.items).toHaveLength(2);
      expect(res.items[0].name).toBe('Underground Inc');
      expect(res.items[0].category).toBe('movie');
      expect(res.items[1].name).toBe('Pulp Fiction');
      expect(res.items[1].category).toBe('movie');
    });

    it('should extract anchor cultural entities from cluster and taste reference expressions', () => {
      const res = RecommendationParser.parse({
        rawRecommendation: 'Recommend iconic modal jazz and hard bop artists connected to the Miles Davis taste cluster'
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].name).toBe('Miles Davis');
      expect(res.items[0].category).toBe('artist');
    });

    it('should synthesize venue category queries with key cultural features', () => {
      const res = RecommendationParser.parse({
        rawRecommendation: 'Recommend 3 neighborhood coffee shops in Shoreditch, London with artisanal vinyl listening spaces.'
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].name).toBe('Vinyl Cafe');
      expect(res.items[0].category).toBe('place');
    });
  });

  describe('Generic Entity Resolution & Candidate Disambiguation', () => {
    let mockClient: ServerQlooClient;
    let resolutionSvc: EntityResolutionService;

    beforeEach(() => {
      mockClient = {
        searchCandidates: vi.fn(),
        getInsights: vi.fn()
      } as unknown as ServerQlooClient;
      resolutionSvc = new EntityResolutionService(mockClient);
    });

    it('should resolve place entities with accent and plural variations via normalization', async () => {
      const placeCandidate: NormalizedCandidate = {
        id: 'place_vinyl_1',
        name: 'Vinyl Cafe',
        type: 'urn:entity:place',
        category: 'entity',
        popularity: 0.95,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValue([placeCandidate]);

      const res = await resolutionSvc.resolve('Vinyl Cafés', {
        location: 'London, UK',
        constraints: ['must feature vinyl audio setups']
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedEntity?.id).toBe('place_vinyl_1');
      expect(res.resolvedEntity?.name).toBe('Vinyl Cafe');
      expect(res.derivedConfidence).toBeGreaterThanOrEqual(0.60);
    });

    it('should prioritize artist entities over biographical person entities when context requests music artists', async () => {
      const artistCand: NormalizedCandidate = {
        id: 'artist_miles',
        name: 'Miles Davis',
        type: 'urn:entity:artist',
        category: 'entity',
        popularity: 0.999,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };
      const personCand: NormalizedCandidate = {
        id: 'person_miles',
        name: 'Miles Davis',
        type: 'urn:entity:person',
        category: 'entity',
        popularity: 0.885,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValue([personCand, artistCand]);

      const res = await resolutionSvc.resolve('Miles Davis', {
        categoryHint: 'artist',
        audience: 'jazz aficionados',
        constraints: ['acoustic jazz artists']
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedEntity?.id).toBe('artist_miles');
      expect(res.resolvedEntity?.type).toBe('urn:entity:artist');
    });

    it('should preserve multiple branches of the same place type without triggering false ambiguity', async () => {
      const branch1: NormalizedCandidate = {
        id: 'branch_1',
        name: 'Vinyl Cafe',
        type: 'urn:entity:place',
        category: 'entity',
        popularity: 0.92,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };
      const branch2: NormalizedCandidate = {
        id: 'branch_2',
        name: 'Vinyl Cafe',
        type: 'urn:entity:place',
        category: 'entity',
        popularity: 0.88,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValue([branch1, branch2]);

      const res = await resolutionSvc.resolve('Vinyl Cafe', {
        location: 'London, UK'
      });

      expect(res.status).toBe('resolved');
      expect(res.resolvedEntity?.id).toBe('branch_1');
    });

    it('should return ambiguous when candidates conflict across distinct domains without differentiating context', async () => {
      const movieCand: NormalizedCandidate = {
        id: 'movie_x',
        name: 'Equinox',
        type: 'urn:entity:movie',
        category: 'entity',
        popularity: 0.85,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };
      const albumCand: NormalizedCandidate = {
        id: 'album_x',
        name: 'Equinox',
        type: 'urn:entity:album',
        category: 'entity',
        popularity: 0.85,
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      };

      vi.mocked(mockClient.searchCandidates).mockResolvedValue([movieCand, albumCand]);

      const res = await resolutionSvc.resolve('Equinox', {});

      expect(res.status).toBe('ambiguous');
      expect(res.resolvedEntity).toBeUndefined();
    });

    it('should return unresolved with insufficient evidence when no candidates match threshold', async () => {
      vi.mocked(mockClient.searchCandidates).mockResolvedValue([]);

      const res = await resolutionSvc.resolve('Nonexistent Cultural Mystery 99999', {});

      expect(res.status).toBe('unresolved');
      expect(res.derivedConfidence).toBe(0);
      expect(res.resolvedEntity).toBeUndefined();
    });
  });
});
