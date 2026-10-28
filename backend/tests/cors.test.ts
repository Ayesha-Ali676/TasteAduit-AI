import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Production CORS & Preflight Verification', () => {
  const PROD_ORIGIN = 'https://taste-aduit-ai.vercel.app';
  const LOCAL_ORIGIN = 'http://localhost:3000';
  const UNALLOWED_ORIGIN = 'https://malicious-unauthorized-origin.com';

  it('1. should allow production origin on GET /api/health with correct Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', PROD_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.body).toEqual({
      status: 'ok',
      service: 'tasteaudit-api'
    });
  });

  it('2. should correctly handle OPTIONS preflight for POST /api/audit with CORS headers', async () => {
    const res = await request(app)
      .options('/api/audit')
      .set('Origin', PROD_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('3. should verify existing GET /api/health works without origin (server probes / direct curl)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'tasteaudit-api'
    });
  });

  it('4. should verify existing POST /api/audit behavior is unchanged and includes CORS headers', async () => {
    const payload = {
      recommendations: 'Dua Lipa',
      enableRepair: false,
      enableAgent: false
    };

    const res = await request(app)
      .post('/api/audit')
      .set('Origin', PROD_ORIGIN)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('items');
  });

  it('5. should preserve localhost development origin support (http://localhost:3000)', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', LOCAL_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(LOCAL_ORIGIN);
  });

  it('6. should NOT allow an arbitrary unlisted origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', UNALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
