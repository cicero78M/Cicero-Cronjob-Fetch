import { env } from '../config/env.js';
import * as postgres from './postgres.js';

let adapter = postgres;

if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'sqlite') {
  adapter = await import('./sqlite.js');
} else if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'mysql') {
  adapter = await import('./mysql.js');
}

function isPostgresDriver() {
  if (!env.DB_DRIVER) return true;
  const normalized = env.DB_DRIVER.toLowerCase();
  return normalized === 'postgres' || normalized === 'postgresql' || normalized === 'pg';
}

function summarizeParams(params) {
  if (Array.isArray(params)) return `[${params.length} params]`;
  if (params && typeof params === 'object') return `object with ${Object.keys(params).length} keys`;
  if (params !== undefined) return 'scalar param';
  return 'none';
}

function isValidSettingKey(key) {
  return typeof key === 'string' && /^[a-zA-Z0-9_.]+$/.test(key);
}

async function applySessionSettings(client, sessionSettings = {}) {
  if (!isPostgresDriver()) {
    return;
  }

  const entries = Object.entries(sessionSettings).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  for (const [key, value] of entries) {
    if (!isValidSettingKey(key)) continue;
    const serializedValue = typeof value === 'string' ? value : String(value);
    await client.query('SELECT set_config($1, $2, true)', [key, serializedValue]);
  }
}

export const query = async (text, params) => {
  const shouldLog = process.env.NODE_ENV !== 'production';
  const paramSummary = summarizeParams(params);
  if (shouldLog) {
    console.log('[DB QUERY]', text, paramSummary);
  }
  try {
    const res = await adapter.query(text, params);
    const count = res?.rowCount ?? res?.rows?.length ?? 0;
    console.log('[DB RESULT]', count);
    return res;
  } catch (err) {
    if (shouldLog) {
      console.error('[DB ERROR]', err.message, { text, paramSummary });
    } else {
      console.error('[DB ERROR]', err.message);
    }
    throw err;
  }
};

export const withTransaction = async (callback, { sessionSettings } = {}) => {
  if (typeof adapter.getClient !== 'function') {
    throw new Error('Current database adapter does not support transactions');
  }

  const client = await adapter.getClient();
  try {
    await client.query('BEGIN');
    if (sessionSettings) {
      await applySessionSettings(client, sessionSettings);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release?.();
  }
};

export const close = () => adapter.close?.();
