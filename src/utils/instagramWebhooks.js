import crypto from 'crypto';

// Verify a signed_request from Instagram and return the decoded payload
export function verifySignedRequest(signedRequest, appSecret) {
  const [sig, payload] = (signedRequest || '').split('.');
  if (!sig || !payload) {
    throw new Error('Invalid signed_request');
  }
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  if (sig !== expected) {
    throw new Error('Signature mismatch');
  }
  const json = Buffer.from(payload, 'base64').toString();
  return JSON.parse(json);
}
