import { fetchInstagramPostInfo } from '../../service/instagramApi.js';
import { sendDebug } from '../../middleware/debugHandler.js';
import { savePostWithMedia, getPostIdsTodayByUsername } from '../../model/instaPostExtendedModel.js';
import { upsertPostMetrics } from '../../model/instaPostMetricsModel.js';

export async function fetchAndStoreDmPostInfo(postId) {
  try {
    const info = await fetchInstagramPostInfo(postId);
    if (!info) return;
    await savePostWithMedia(info);
    if (info.metrics) {
      await upsertPostMetrics(info.id, info.metrics);
    }
    sendDebug({ tag: 'IG DM POST INFO', msg: `Fetched info for ${postId}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM POST INFO', msg: `[${postId}] ${err.message}` });
  }
}

export async function fetchDmPostInfoForUser(username) {
  const ids = await getPostIdsTodayByUsername(username);
  for (const id of ids) {
    await fetchAndStoreDmPostInfo(id);
  }
}
