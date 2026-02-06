import { analyzeInstagramData } from '../src/utils/analyzeInstagram.js';

describe('analyzeInstagramData', () => {
  test('computes stats from items', () => {
    const data = { items: [
      { like_count: 10, comment_count: 2, thumbnail_url: 'a' },
      { like_count: 5, comment_count: 1, image_versions:{items:[{url:'b'}]} }
    ] };
    const result = analyzeInstagramData(data);
    expect(result.stats.total_posts).toBe(2);
    expect(result.stats.total_likes).toBe(15);
    expect(result.posts[0].thumbnail_url).toBe('a');
    expect(result.posts[0].thumbnail).toBe('a');
    expect(result.posts[1].thumbnail_url).toBe('b');
    expect(result.posts[1].thumbnail).toBe('b');
  });
});
