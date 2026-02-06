import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { query } from '../db/index.js';

const SCOPES = ['https://www.googleapis.com/auth/contacts'];
const TOKEN_PATH = path.resolve('token.json');
const CREDENTIALS_PATH = path.resolve('credentials.json');

// Cache phone numbers that have been processed to avoid redundant DB lookups
const processedContacts = new Map(); // phone -> expiration timestamp
let contactCacheTtl = Number(process.env.CONTACT_CACHE_TTL_MS) || 300000; // default 5 minutes
const authWarningHistory = new Map(); // message -> timestamp
const authCooldownMs =
  Number(process.env.CONTACT_AUTH_COOLDOWN_MS) || 300000; // default 5 minutes
let authUnavailableUntil = 0;

export function setContactCacheTTL(ms) {
  contactCacheTtl = ms;
}

export function clearContactCache() {
  processedContacts.clear();
}

function logAuthWarning(message) {
  const now = Date.now();
  const last = authWarningHistory.get(message) || 0;
  if (now - last >= authCooldownMs) {
    console.warn(message);
    authWarningHistory.set(message, now);
  }
}

function setAuthCooldown() {
  authUnavailableUntil = Date.now() + authCooldownMs;
}

function shouldSkipAuthAttempt() {
  return Date.now() < authUnavailableUntil;
}

function isCached(phone) {
  const expiry = processedContacts.get(phone);
  if (expiry && expiry > Date.now()) return true;
  processedContacts.delete(phone);
  return false;
}

function addToCache(phone) {
  processedContacts.set(phone, Date.now() + contactCacheTtl);
}

export async function authorize() {
  if (shouldSkipAuthAttempt()) return null;
  let credentials;
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(content);
  } catch {
    logAuthWarning(
      '[GOOGLE CONTACT] credentials.json not found, skipping contact save.'
    );
    setAuthCooldown();
    return null;
  }
  const credsData = credentials.installed || credentials.web;
  const { client_secret, client_id, redirect_uris = [] } = credsData || {};
  if (!redirect_uris.length) {
    logAuthWarning(
      '[GOOGLE CONTACT] redirect_uris missing in credentials.json, skipping contact save.'
    );
    setAuthCooldown();
    return null;
  }
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  try {
    const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    // Refresh if token expired or will expire within 5 minutes
    const buffer = 5 * 60 * 1000;
    if (!token.expiry_date || token.expiry_date <= Date.now() + buffer) {
      try {
        await oAuth2Client.getAccessToken();
        await fs.writeFile(
          TOKEN_PATH,
          JSON.stringify(oAuth2Client.credentials)
        );
      } catch (err) {
        console.error('[GOOGLE CONTACT] token refresh failed:', err.message);
        setAuthCooldown();
        return null;
      }
    }
    // Persist refreshed tokens whenever they are updated
    oAuth2Client.on('tokens', async () => {
      try {
        await fs.writeFile(
          TOKEN_PATH,
          JSON.stringify(oAuth2Client.credentials)
        );
      } catch (err) {
        console.error('[GOOGLE CONTACT] failed to persist token:', err.message);
      }
    });
  } catch {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    logAuthWarning(
      '[GOOGLE CONTACT] token.json not found, skipping contact save.'
    );
    setAuthCooldown();
    return null;
  }
  return oAuth2Client;
}

export async function searchByNumbers(auth, numbers = []) {
  if (!numbers.length) return {};
  const service = google.people({ version: 'v1', auth });
  const found = {};
  for (const num of numbers) {
    try {
      const res = await service.people.searchContacts({
        query: num,
        readMask: 'names,phoneNumbers',
        pageSize: 1,
      });
      if (res.data.results && res.data.results.length) {
        const resourceName = res.data.results[0]?.person?.resourceName || null;
        found[num] = resourceName;
      }
    } catch (err) {
      console.error('[GOOGLE CONTACT] search failed:', err.message);
    }
  }
  return found;
}

export async function saveGoogleContact(auth, { name, phone }) {
  // Hindari duplikasi dengan memeriksa kontak yang sudah ada
  try {
    const exists = await searchByNumbers(auth, [phone]);
    if (exists[phone]) return exists[phone];
  } catch (err) {
    console.error('[GOOGLE CONTACT] duplicate check failed:', err.message);
  }
  const service = google.people({ version: 'v1', auth });
  const res = await service.people.createContact({
    requestBody: {
      names: [{ givenName: name }],
      phoneNumbers: [{ value: `+${phone}` }],
    },
  });
  return res.data.resourceName;
}

export async function saveContactIfNew(chatId) {
  const phone = (chatId || '').replace(/[^0-9]/g, '');
  if (!phone || isCached(phone)) return;
  try {
    const check = await query(
      'SELECT phone_number, resource_name FROM saved_contact WHERE phone_number = $1',
      [phone]
    );
    if (check.rowCount > 0 && check.rows[0]?.resource_name) {
      addToCache(phone);
      return;
    }
    const auth = await authorize();
    if (!auth) return;

    if (check.rowCount > 0 && !check.rows[0]?.resource_name) {
      const existing = await searchByNumbers(auth, [phone]);
      if (existing[phone]) {
        await query(
          `INSERT INTO saved_contact (phone_number, resource_name)
           VALUES ($1, $2)
           ON CONFLICT (phone_number) DO UPDATE SET resource_name = EXCLUDED.resource_name`,
          [phone, existing[phone]]
        );
        addToCache(phone);
        return;
      }
      try {
        const { rows } = await query(
          'SELECT nama FROM "user" WHERE whatsapp = $1 LIMIT 1',
          [phone]
        );
        const userName = rows[0]?.nama || phone;
        const resourceName = await saveGoogleContact(auth, {
          name: userName,
          phone,
        });
        await query(
          `INSERT INTO saved_contact (phone_number, resource_name)
           VALUES ($1, $2)
           ON CONFLICT (phone_number) DO UPDATE SET resource_name = EXCLUDED.resource_name`,
          [phone, resourceName]
        );
        addToCache(phone);
        return;
      } catch (lookupErr) {
        console.error('[GOOGLE CONTACT] user lookup failed:', lookupErr.message);
        return;
      }
    }

    const exists = await searchByNumbers(auth, [phone]);
    if (exists[phone]) {
      await query(
        `INSERT INTO saved_contact (phone_number, resource_name)
         VALUES ($1, $2)
         ON CONFLICT (phone_number) DO UPDATE SET resource_name = EXCLUDED.resource_name`,
        [phone, exists[phone]]
      );
      addToCache(phone);
      return;
    }
    let displayName = phone;
    try {
      const { rows } = await query(
        `SELECT c.nama AS client_name
         FROM dashboard_user du
         JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
         JOIN clients c ON duc.client_id = c.client_id
         WHERE du.whatsapp = $1
         UNION
         SELECT c.nama AS client_name FROM clients c WHERE c.client_operator = $1
         LIMIT 1`,
        [phone]
      );
      const clientName = rows[0]?.client_name;
      if (clientName) displayName = `Admin ${clientName}`;
    } catch (lookupErr) {
      console.error(
        '[GOOGLE CONTACT] client lookup failed:',
        lookupErr.message
      );
    }
    const resourceName = await saveGoogleContact(auth, {
      name: displayName,
      phone,
    });
    await query(
      `INSERT INTO saved_contact (phone_number, resource_name)
       VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET resource_name = EXCLUDED.resource_name`,
      [phone, resourceName]
    );
    addToCache(phone);
  } catch (err) {
    const status = err?.response?.status || err.code;
    console.error(
      '[GOOGLE CONTACT] Failed to save contact:',
      err.message,
      status ? `(status ${status})` : ''
    );
  }
}
