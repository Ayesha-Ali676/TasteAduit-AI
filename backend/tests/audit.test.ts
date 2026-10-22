import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { qlooClient } from '../src/services/qloo/qloo.client.js';

describe('POST /api/audit', () => {
  it('should accept a valid audit request and return parse and resolve results', async () => {
    vi.spyOn(qlooClient, 'searchCandidates').mockResolvedValueOnce([
      {
        id: 'ent_1',
        name: 'Indie Folk',
        type: 'urn:tag:genre:music',
        category: 'tag',
        source: 'qloo',
        retrievedAt: new Date().toISOString()
      }
    ]);
    vi.spyOn(qlooClient, 'getInsights').mockResolvedValueOnce([
      {
        entity_id: 'ent_related_1',
        name: 'Bon Iver',
        types: ['urn:entity:artist'],
        query: { affinity: 0.91 }
      }
    ]);
    vi.spyOn(qlooClient, 'getEntityDetails').mockResolvedValueOnce(null);

    const validPayload = {
      recommendations: 'Indie Folk',
      audienceContext: 'Young adults, introverted readers',
      location: 'Kyoto, Japan',
      constraints: ['no loud percussion', 'acoustic preferred']
    };

    const res = await request(app)
      .post('/api/audit')
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(['partial_pipeline', 'scaffold']).toContain(res.body.status);
    expect(res.body.stagesExecuted).toContain('PARSE');
    expect(res.body.stagesExecuted).toContain('RESOLVE');
    expect(res.body.stagesExecuted).toContain('RETRIEVE');
    expect(res.body.stagesExecuted).toContain('AUDIT');
    expect(res.body.input.rawRecommendation).toBe(validPayload.recommendations);
    expect(res.body.scaffoldDetails.deterministicModelReady).toBe(true);
    expect(res.body.scaffoldDetails.weights).toEqual({
      culturalAlignment: 0.4,
      contextualRelevance: 0.25,
      constraintCompliance: 0.2,
      evidenceCompleteness: 0.15
    });
    expect(res.body.resolutionSummary).toBeDefined();
    expect(res.body.evidenceSummary).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].evidence).toBeDefined();
    expect(res.body.items[0].evidence.status).toBe('supported');
    expect(res.body.items[0].audit).toBeDefined();
    expect(res.body.items[0].audit.dimensions).toBeDefined();
    expect(res.body.items[0].audit.overallScore).toBeGreaterThanOrEqual(0);
    expect(res.body.auditReport).toBeDefined();
    expect(res.body.auditReport.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('should reject a request with missing recommendations text with 400', async () => {
    const invalidPayload = {
      audienceContext: 'Readers in Kyoto'
    };

    const res = await request(app)
      .post('/api/audit')
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('should reject empty or whitespace recommendations with 400', async () => {
    const invalidPayload = {
      recommendations: '   '
    };

    const res = await request(app)
      .post('/api/audit')
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('should reject excessively long recommendations exceeding bounded limits', async () => {
    const invalidPayload = {
      recommendations: 'a'.repeat(5001)
    };

    const res = await request(app)
      .post('/api/audit')
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});
