import { query } from '../repository/db.js';

export async function insertVisitorLog({ ip, userAgent }) {
  await query(
    'INSERT INTO visitor_logs (ip, user_agent, visited_at) VALUES ($1, $2, NOW())',
    [ip || '', userAgent || '']
  );
}

export async function getVisitorLogs() {
  const { rows } = await query(
    'SELECT * FROM visitor_logs ORDER BY visited_at DESC'
  );
  return rows;
}
