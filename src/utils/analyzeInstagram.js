export function analyzeInstagramData(json) {
  if (!json || !Array.isArray(json.items)) {
    return { posts: [], stats: { total_posts: 0, total_likes: 0, total_comments: 0, avg_likes: 0, avg_comments: 0 } };
  }

  const posts = json.items.map(item => {
    const thumbnail =
      item.thumbnail_url ||
      item.thumbnail_src ||
      item.display_url ||
      (item.image_versions?.items?.[0]?.url) ||
      (item.image_versions2?.candidates?.[0]?.url);
    const caption = typeof item.caption === 'object' ? item.caption.text : item.caption;
    const taken_at = item.taken_at_ts ? new Date(item.taken_at_ts * 1000).toISOString() : (item.taken_at || null);
    return {
      id: item.id || item.code,
      caption,
      taken_at,
      like_count: item.like_count || 0,
      comment_count: item.comment_count || 0,
      thumbnail_url: thumbnail || null,
      thumbnail: thumbnail || null,
      is_video: item.is_video || false,
    };
  });

  const totalLikes = posts.reduce((a, p) => a + (p.like_count || 0), 0);
  const totalComments = posts.reduce((a, p) => a + (p.comment_count || 0), 0);
  const stats = {
    total_posts: posts.length,
    total_likes: totalLikes,
    total_comments: totalComments,
    avg_likes: posts.length ? totalLikes / posts.length : 0,
    avg_comments: posts.length ? totalComments / posts.length : 0,
  };

  return { posts, stats };
}
