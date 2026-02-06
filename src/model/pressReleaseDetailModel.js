import { query } from '../repository/db.js';

export async function findDetailByEvent(eventId) {
  const res = await query(
    'SELECT * FROM press_release_detail WHERE event_id=$1',
    [eventId]
  );
  return res.rows[0] || null;
}

export async function createDetail(data) {
  const res = await query(
    `INSERT INTO press_release_detail (
      event_id, judul, dasar, tersangka, tkp, kronologi, modus,
      barang_bukti, pasal, ancaman, catatan
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.event_id,
      data.judul || null,
      data.dasar || null,
      data.tersangka || null,
      data.tkp || null,
      data.kronologi || null,
      data.modus || null,
      data.barang_bukti || null,
      data.pasal || null,
      data.ancaman || null,
      data.catatan || null
    ]
  );
  return res.rows[0];
}

export async function updateDetail(eventId, data) {
  const old = await findDetailByEvent(eventId);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE press_release_detail SET
      judul=$2,
      dasar=$3,
      tersangka=$4,
      tkp=$5,
      kronologi=$6,
      modus=$7,
      barang_bukti=$8,
      pasal=$9,
      ancaman=$10,
      catatan=$11
     WHERE event_id=$1 RETURNING *`,
    [
      eventId,
      merged.judul || null,
      merged.dasar || null,
      merged.tersangka || null,
      merged.tkp || null,
      merged.kronologi || null,
      merged.modus || null,
      merged.barang_bukti || null,
      merged.pasal || null,
      merged.ancaman || null,
      merged.catatan || null
    ]
  );
  return res.rows[0];
}
