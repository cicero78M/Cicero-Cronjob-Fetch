import crypto from 'crypto';
import { verifySignedRequest } from '../src/utils/instagramWebhooks.js';

describe('verifySignedRequest', () => {
  test('returns payload when signature is valid', () => {
    const secret = 'test-secret';
    const payload = { user_id: '1', issued_at: 123 };
    const encodedPayload = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const signed = `${signature}.${encodedPayload}`;
    const result = verifySignedRequest(signed, secret);
    expect(result.user_id).toBe(payload.user_id);
  });
});
