import { query } from '../repository/db.js';
import { formatIsoTimestamp, formatDdMmYyyy } from '../utils/utilsHelper.js';

export async function getEvents(userId) {
  const res = await query(
    `SELECT e.*, u.username AS updated_by_username
     FROM editorial_event e
     LEFT JOIN penmas_user u ON u.user_id = e.updated_by
     WHERE e.created_by = $1 OR e.assignee = $1
     ORDER BY e.event_date ASC`,
    [userId]
  );
  return res.rows.map((row) => ({
    ...row,
    last_updated: row.last_update,
    event_date: formatDdMmYyyy(row.event_date),
  }));
}

export async function findEventById(id) {
  const res = await query('SELECT * FROM editorial_event WHERE event_id = $1', [id]);
  return res.rows[0] || null;
}

export async function createEvent(data) {
  const eventDate = formatIsoTimestamp(data.event_date);
  const res = await query(
    `INSERT INTO editorial_event (
      event_date, topic, judul_berita, assignee, status, content, summary, image_path,
      tag, kategori,
      created_by, updated_by, created_at, last_update
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, COALESCE($13, NOW()), COALESCE($14, NOW()))
     RETURNING *`,
    [
      eventDate,
      data.topic,
      data.judul_berita || null,
      data.assignee || null,
      data.status || 'draft',
      data.content || null,
      data.summary || null,
      data.image_path || null,
      data.tag || null,
      data.kategori || null,
      data.created_by,
      data.updated_by || data.created_by,
      data.created_at || null,
      data.last_update || null
    ]
  );
  return res.rows[0];
}

export async function updateEvent(id, data) {
  const old = await findEventById(id);
  if (!old) return null;
  const merged = { ...old, ...data };
  merged.event_date = formatIsoTimestamp(merged.event_date);
  const res = await query(
    `UPDATE editorial_event SET
      event_date=$2,
      topic=$3,
      judul_berita=$4,
      assignee=$5,
      status=$6,
      content=$7,
      summary=$8,
      image_path=$9,
      tag=$10,
      kategori=$11,
      updated_by=$12,
      last_update=COALESCE($13, NOW())
     WHERE event_id=$1 RETURNING *`,
    [
      id,
      merged.event_date,
      merged.topic,
      merged.judul_berita || null,
      merged.assignee || null,
      merged.status,
      merged.content || null,
      merged.summary || null,
      merged.image_path || null,
      merged.tag || null,
      merged.kategori || null,
      data.updated_by || merged.updated_by || null,
      merged.last_update || null
    ]
  );
  return res.rows[0];
}

export async function deleteEvent(id) {
  const res = await query('DELETE FROM editorial_event WHERE event_id=$1 RETURNING *', [id]);
  return res.rows[0] || null;
}
