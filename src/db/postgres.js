import pkg from 'pg';
import { env } from '../config/env.js';
const { Pool } = pkg;

const pool = new Pool({
  user: env.DB_USER,
  host: env.DB_HOST,
  database: env.DB_NAME,
  password: env.DB_PASS,
  port: env.DB_PORT,
  connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
  query_timeout: env.DB_QUERY_TIMEOUT_MS,
  statement_timeout: env.DB_QUERY_TIMEOUT_MS,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  max: env.DB_POOL_MAX,
  keepAlive: true,
});

pool.on('error', (error) => {
  console.error('[DB POOL ERROR]', error?.message || error);
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export const close = () => pool.end();
