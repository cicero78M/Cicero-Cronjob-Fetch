import { newDb } from 'pg-mem';

describe('insta_post cascade delete', () => {
  test('removes related ig_ext_posts rows', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    await pool.query(`CREATE TABLE insta_post (
      shortcode VARCHAR PRIMARY KEY
    );`);

    await pool.query(`CREATE TABLE ig_ext_posts (
      post_id VARCHAR PRIMARY KEY,
      shortcode VARCHAR UNIQUE REFERENCES insta_post(shortcode) ON DELETE CASCADE
    );`);

    await pool.query(`INSERT INTO insta_post (shortcode) VALUES ('abc');`);
    await pool.query(`INSERT INTO ig_ext_posts (post_id, shortcode) VALUES ('p1', 'abc');`);

    await pool.query(`DELETE FROM insta_post WHERE shortcode = 'abc';`);

    const res = await pool.query('SELECT * FROM ig_ext_posts;');
    expect(res.rows).toHaveLength(0);
  });
});
