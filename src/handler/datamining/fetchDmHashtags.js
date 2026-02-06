import { query } from '../../db/index.js';
import { fetchInstagramHashtag } from '../../service/instagramApi.js';
import { upsertHashtagInfo } from '../../model/instaHashtagModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

function extractTopHashtags(captions) {
  const count = {};
  for (const text of captions) {
    const matches = text ? text.match(/#[A-Za-z0-9_]+/g) : null;
    if (!matches) continue;
    for (const m of matches) {
      const tag = m.replace('#', '').toLowerCase();
      count[tag] = (count[tag] || 0) + 1;
    }
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
}

export async function fetchDmHashtagsForUser(username) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const { rows } = await query(
    `SELECT p.caption_text FROM ig_ext_posts p JOIN ig_ext_users u ON u.user_id = p.user_id WHERE u.username = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  const captions = rows.map(r => r.caption_text || '');
  const topTags = extractTopHashtags(captions);
  for (const tag of topTags) {
    try {
      const { info } = await fetchInstagramHashtag(tag);
      if (info) await upsertHashtagInfo({ id: info.id, name: info.name, ...info });
      sendDebug({ tag: 'IG DM', msg: `Hashtag ${tag} disimpan`, username });
    } catch (err) {
      sendDebug({ tag: 'IG DM', msg: `Gagal hashtag ${tag}: ${err.message}`, username });
    }
  }
}
