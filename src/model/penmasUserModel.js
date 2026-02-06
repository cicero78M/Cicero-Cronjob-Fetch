import { query } from '../repository/db.js';

export async function findByUsername(username) {
  const res = await query(
    'SELECT * FROM penmas_user WHERE username = $1',
    [username]
  );
  return res.rows[0] || null;
}

export async function createUser(data) {
  const res = await query(
    `INSERT INTO penmas_user (user_id, username, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.user_id, data.username, data.password_hash, data.role]
  );
  return res.rows[0];
}

export async function findById(userId) {
  const res = await query(
    'SELECT * FROM penmas_user WHERE user_id = $1',
    [userId]
  );
  return res.rows[0] || null;
}
