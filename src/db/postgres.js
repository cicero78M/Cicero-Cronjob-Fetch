import pkg from 'pg';
import { env } from '../config/env.js';
const { Pool } = pkg;

const pool = new Pool({
  user: env.DB_USER,
  host: env.DB_HOST,
  database: env.DB_NAME,
  password: env.DB_PASS,
  port: env.DB_PORT,
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export const close = () => pool.end();
