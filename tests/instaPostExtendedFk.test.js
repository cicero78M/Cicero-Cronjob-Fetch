import { newDb } from 'pg-mem';
import { jest } from '@jest/globals';

describe('upsertIgPost foreign key handling', () => {
  test('creates parent insta_post row when missing', async () => {
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
      media_type INT,
      is_pinned BOOLEAN
    );`);

    jest.unstable_mockModule('../src/repository/db.js', () => ({
      query: (text, params) => pool.query(text, params)
    }));

    const { upsertIgPost } = await import('../src/model/instaPostExtendedModel.js');

    const post = { id: 'p1', shortcode: 'abc', taken_at: 1000, like_count: 5 };
    await upsertIgPost(post, 'u1');

    const parent = await pool.query('SELECT shortcode FROM insta_post');
    const child = await pool.query('SELECT shortcode FROM ig_ext_posts');

    expect(parent.rows[0].shortcode).toBe('abc');
    expect(child.rows[0].shortcode).toBe('abc');
  });
});
