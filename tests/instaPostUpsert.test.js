import { newDb } from 'pg-mem';
import { jest } from '@jest/globals';

describe('upsertIgPost', () => {
  test('updates existing post on conflict', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    db.public.registerFunction({
      name: 'to_timestamp',
      args: ['text'],
      returns: 'timestamp',
      implementation: (str) => new Date(parseFloat(str) * 1000)
    });

    await pool.query(`CREATE TABLE insta_post (
      shortcode VARCHAR PRIMARY KEY,
      created_at TIMESTAMP
    );`);

    await pool.query(`CREATE TABLE ig_ext_posts (
      post_id VARCHAR PRIMARY KEY,
      shortcode VARCHAR REFERENCES insta_post(shortcode),
      user_id VARCHAR,
      caption_text TEXT,
      created_at TIMESTAMP,
      like_count INT,
      comment_count INT,
      is_video BOOLEAN,
      media_type VARCHAR,
      is_pinned BOOLEAN
    );`);

    jest.unstable_mockModule('../src/repository/db.js', () => ({
      query: (text, params) => pool.query(text, params)
    }));

    const { upsertIgPost } = await import('../src/model/instaPostExtendedModel.js');

    const initialPost = { id: 'p1', shortcode: 'abc', taken_at: 1000, like_count: 5 };
    await upsertIgPost(initialPost, 'u1');

    const updatedPost = { id: 'p1', shortcode: 'abc', taken_at: 2000, like_count: 20 };
    await upsertIgPost(updatedPost, 'u1');

    const res = await pool.query(
      'SELECT like_count, extract(epoch from created_at) as ts FROM ig_ext_posts WHERE post_id = $1',
      ['p1']
    );

    expect(res.rows[0].like_count).toBe(20);
    expect(Number(res.rows[0].ts)).toBe(2000);
  });
});
