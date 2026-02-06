import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { dashboardPremiumGuard } from '../src/middleware/dashboardPremiumGuard.js';
import { dashboardPremiumConfig } from '../src/config/dashboardPremium.js';

jest.mock('../src/service/dashboardSubscriptionService.js', () => ({
  getPremiumSnapshot: jest.fn(),
}));

function buildApp(allowedTiers, userContext) {
  const app = express();
  app.get(
    '/api/dashboard/anev',
    (req, res, next) => {
      req.dashboardUser = { ...userContext };
      next();
    },
    dashboardPremiumGuard(allowedTiers),
    (req, res) => {
      res.json({ success: true, premiumGuard: req.premiumGuard });
    },
  );
  return app;
}

describe('dashboardPremiumGuard', () => {
  test('allows premium_1 tier when included in allowed tiers config', async () => {
    const app = buildApp(dashboardPremiumConfig.allowedTiers, {
      premium_status: true,
      premium_tier: 'Premium_1',
      premium_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await request(app).get('/api/dashboard/anev');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.premiumGuard).toMatchObject({
      premiumStatus: true,
      premiumTier: 'premium_1',
    });
  });

  test('rejects expired premium even when tier is allowed', async () => {
    const app = buildApp(['premium_1'], {
      premium_status: true,
      premium_tier: 'premium_1',
      premium_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await request(app).get('/api/dashboard/anev');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/kedaluwarsa/i);
  });

  test('rejects tiers outside the allowed list', async () => {
    const app = buildApp(['tier1', 'premium_1'], {
      premium_status: true,
      premium_tier: 'tier3',
      premium_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await request(app).get('/api/dashboard/anev');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/tidak diizinkan/i);
  });
});
