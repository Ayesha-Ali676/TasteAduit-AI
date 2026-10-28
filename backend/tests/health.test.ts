import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Health Endpoint Verification', () => {
  it('GET /api/health should return 200 and health status object', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'tasteaudit-api'
    });
  });

  it('GET /health and GET / should also return 200 for cloud monitoring probes', async () => {
    const resHealth = await request(app).get('/health');
    expect(resHealth.status).toBe(200);
    expect(resHealth.body).toEqual({
      status: 'ok',
      service: 'tasteaudit-api'
    });

    const resRoot = await request(app).get('/');
    expect(resRoot.status).toBe(200);
    expect(resRoot.body).toEqual({
      status: 'ok',
      service: 'tasteaudit-api'
    });
  });
});
