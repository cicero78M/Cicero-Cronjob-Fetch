import { query } from '../repository/db.js';

export async function getLogsByEvent(eventId) {
  const res = await query(
    `SELECT l.*, u.username
     FROM change_log l
     LEFT JOIN penmas_user u ON u.user_id = l.user_id
     WHERE l.event_id=$1
     ORDER BY l.logged_at ASC`,
    [eventId]
  );
  return res.rows;
}

export async function createLog(data) {
  const res = await query(
    `INSERT INTO change_log (
      event_id, user_id, status, changes, logged_at
     ) VALUES ($1,$2,$3,$4, COALESCE($5, NOW()))
     RETURNING *`,
    [
      data.event_id,
      data.user_id,
      data.status,
      data.changes || null,
      data.logged_at || null
    ]
  );
  return res.rows[0];
}
