import { fetchInstagramPosts } from '../../service/instagramApi.js';
import { sendDebug } from '../../middleware/debugHandler.js';
import { savePostWithMedia } from '../../model/instaPostExtendedModel.js';

export async function fetchDmPosts(username, limit = 50) {
  if (!username) return [];
  try {
    const posts = await fetchInstagramPosts(username, limit);
    for (const post of posts) {
      await savePostWithMedia(post);
    }
    sendDebug({ tag: 'IG DM POST', msg: `Fetched ${posts.length} posts for @${username}` });
    return posts.map(p => p.id);
  } catch (err) {
    sendDebug({ tag: 'IG DM POST ERROR', msg: err.message });
    return [];
  }
}
