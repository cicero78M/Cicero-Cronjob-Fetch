import { query } from '../repository/db.js';

export async function getApprovalRequests() {
  const res = await query('SELECT * FROM approval_request ORDER BY created_at DESC');
  return res.rows;
}

export async function findRequestById(id) {
  const res = await query('SELECT * FROM approval_request WHERE request_id=$1', [id]);
  return res.rows[0] || null;
}

export async function createRequest(data) {
  const res = await query(
    `INSERT INTO approval_request (
      event_id, requested_by, status, created_at, updated_at
     ) VALUES ($1,$2,$3, COALESCE($4, NOW()), COALESCE($5, NOW()))
     RETURNING *`,
    [
      data.event_id,
      data.requested_by,
      data.status || 'pending',
      data.created_at || null,
      data.updated_at || null
    ]
  );
  return res.rows[0];
}

export async function updateRequest(id, data) {
  const old = await findRequestById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE approval_request SET
      event_id=$2,
      requested_by=$3,
      status=$4,
      updated_at=COALESCE($5, NOW())
     WHERE request_id=$1 RETURNING *`,
    [
      id,
      merged.event_id,
      merged.requested_by,
      merged.status,
      data.updated_at || null
    ]
  );
  return res.rows[0];
}
