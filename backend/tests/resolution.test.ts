import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityResolutionService } from '../src/services/resolution/resolution.service.js';
import { ServerQlooClient } from '../src/services/qloo/qloo.client.js';
import { NormalizedCandidate } from '../src/services/qloo/qloo.types.js';

describe('EntityResolutionService (Deterministic Resolution & Ambiguity)', () => {
  let mockClient: ServerQlooClient;
  let service: EntityResolutionService;

  beforeEach(() => {
    mockClient = new ServerQlooClient({ apiKey: 'mock-key' });
    service = new EntityResolutionService(mockClient);
  });

  it('should handle empty queries gracefully without calling client', async () => {
    const searchSpy = vi.spyOn(mockClient, 'searchCandidates');
    const result = await service.resolve('   ');

    expect(result.status).toBe('unresolved');
    expect(result.candidates).toEqual([]);
    expect(result.provenance.resolutionStatus).toBe('unresolved');
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('should return unresolved when Qloo returns zero candidates', async () => {
    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([]);

    const result = await service.resolve('obscure unknown concept xyz');
    expect(result.status).toBe('unresolved');
    expect(result.candidates).toEqual([]);
    expect(result.provenance.resolutionStatus).toBe('unresolved');
  });

  it('should resolve a single clear, reliable match', async () => {
    const candidate: NormalizedCandidate = {
      id: 'ent_miles_davis',
      name: 'Miles Davis',
      type: 'urn:entity:artist',
      category: 'entity',
      popularity: 0.98,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidate]);

    const result = await service.resolve('Miles Davis');
    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.name).toBe('Miles Davis');
    expect(result.resolvedEntity?.id).toBe('ent_miles_davis');
    expect(result.provenance.classification).toBe('Supported');
    expect(result.provenance.source).toBe('qloo-hackathon-api');
    expect(result.provenance.entityId).toBe('ent_miles_davis');
    expect(result.provenance.correlationId).toBeDefined();
  });

  it('should identify multiple ambiguous candidates and NOT blindly pick candidate #1', async () => {
    const candidateGenre: NormalizedCandidate = {
      id: 'tag_jazz_genre',
      name: 'Jazz',
      type: 'urn:tag:genre:music',
      category: 'tag',
      popularity: 0.99,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    const candidateAlbum: NormalizedCandidate = {
      id: 'ent_jazz_album',
      name: 'Jazz',
      type: 'urn:entity:album',
      category: 'entity',
      popularity: 0.98,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    const candidateBook: NormalizedCandidate = {
      id: 'ent_jazz_book',
      name: 'Jazz',
      type: 'urn:entity:book',
      category: 'entity',
      popularity: 0.85,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([
      candidateGenre,
      candidateAlbum,
      candidateBook
    ]);

    // Query "Jazz" without context
    const result = await service.resolve('Jazz');

    // Must be ambiguous, not resolved to candidate #1!
    expect(result.status).toBe('ambiguous');
    expect(result.resolvedEntity).toBeUndefined();
    expect(result.candidates).toHaveLength(3);
    expect(result.reason).toContain('Multiple plausible Qloo matches');
    expect(result.provenance.resolutionStatus).toBe('ambiguous');
    expect(result.provenance.classification).toBe('Inferred');
  });

  it('should disambiguate when categoryHint aligns with a specific candidate', async () => {
    const candidateGenre: NormalizedCandidate = {
      id: 'tag_jazz_genre',
      name: 'Jazz',
      type: 'urn:tag:genre:music',
      category: 'tag',
      popularity: 0.99,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    const candidateAlbum: NormalizedCandidate = {
      id: 'ent_jazz_album',
      name: 'Jazz',
      type: 'urn:entity:album',
      category: 'entity',
      popularity: 0.98,
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([
      candidateGenre,
      candidateAlbum
    ]);

    // Query "Jazz" with category hint "music" or "genre"
    const result = await service.resolve('Jazz', { categoryHint: 'genre:music' });

    expect(result.status).toBe('resolved');
    expect(result.resolvedEntity?.id).toBe('tag_jazz_genre');
    expect(result.provenance.classification).toBe('Supported');
  });

  it('should maintain full provenance and traceability', async () => {
    const candidate: NormalizedCandidate = {
      id: 'ent_test',
      name: 'Test Artist',
      type: 'urn:entity:artist',
      category: 'entity',
      source: 'qloo',
      retrievedAt: new Date().toISOString()
    };

    vi.spyOn(mockClient, 'searchCandidates').mockResolvedValueOnce([candidate]);

    const result = await service.resolve('Test Artist');
    expect(result.provenance).toBeDefined();
    expect(result.provenance.operation).toBe('resolve_entity');
    expect(result.provenance.source).toBe('qloo-hackathon-api');
    expect(result.provenance.correlationId).toMatch(/^res_\d+_[a-f0-9]+/);
    expect(result.provenance.retrievedAt).toBeDefined();
  });
});
