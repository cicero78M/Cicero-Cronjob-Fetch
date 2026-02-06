import { fetchInstagramPostInfo } from '../../service/instagramApi.js';
import { getShortcodesTodayByClient } from '../../model/instaPostModel.js';
import { savePostWithMedia } from '../../model/instaPostExtendedModel.js';
import { upsertPostMetrics } from '../../model/instaPostMetricsModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

export async function fetchAndStorePostInfo(shortcode) {
  try {
    const info = await fetchInstagramPostInfo(shortcode);
    if (!info) return;
    await savePostWithMedia(info);
    if (info.metrics) {
      await upsertPostMetrics(info.id, info.metrics);
    }
    sendDebug({ tag: 'IG POST INFO', msg: `Fetched info for ${shortcode}` });
  } catch (err) {
    sendDebug({ tag: 'IG POST INFO', msg: `[${shortcode}] ${err.message}` });
  }
}

export async function fetchPostInfoForClient(clientId) {
  const shortcodes = await getShortcodesTodayByClient(clientId);
  for (const sc of shortcodes) {
    await fetchAndStorePostInfo(sc);
  }
}
