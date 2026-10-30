// Phase 3 verification: the Express app boots and talks to MySQL.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('server foundation', () => {
  it('GET /api/health reports a live database connection', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.database).toBe('connected');
  });

  it('GET / describes the API', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.body.name).toBe('Ganza Mart API');
  });

  it('unknown routes return the centralized 404 JSON shape', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.error).toMatch(/Route not found/);
  });

  it('sets security headers (helmet) and blocks foreign origins (CORS)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    const foreign = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example')
      .expect(200);
    // No access-control-allow-origin header means the browser will block the call.
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects oversized JSON bodies instead of processing them', async () => {
    const huge = { blob: 'x'.repeat(200 * 1024) };
    await request(app).post('/api/health').send(huge).expect(413);
  });
});
