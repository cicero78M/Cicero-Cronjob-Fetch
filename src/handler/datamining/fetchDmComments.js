import pLimit from 'p-limit';
import { fetchAllInstagramComments } from '../../service/instagramApi.js';
import { getPostIdShortcodePairsTodayByUsername } from '../../model/instaPostExtendedModel.js';
import { insertIgPostComments } from '../../model/igPostCommentModel.js';
import { upsertIgUser } from '../../model/instaPostExtendedModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

const limit = pLimit(3);

export async function handleFetchKomentarInstagramDM(username) {
  try {
    const posts = await getPostIdShortcodePairsTodayByUsername(username);
    if (!posts.length) {
      sendDebug({ tag: 'IG DM COMMENT', msg: `Tidak ada post IG hari ini untuk @${username}` });
      return;
    }
    let sukses = 0, gagal = 0;
    for (const p of posts) {
      await limit(async () => {
        try {
          const comments = await fetchAllInstagramComments(p.post_id);
          for (const c of comments) {
            if (c.user) await upsertIgUser(c.user);
          }
          await insertIgPostComments(p.post_id, comments);
          sukses++;
        } catch (err) {
          gagal++;
          sendDebug({ tag: 'IG DM COMMENT ERROR', msg: `Gagal ${p.shortcode}: ${err.message}` });
        }
      });
    }
    sendDebug({ tag: 'IG DM COMMENT', msg: `Selesai komentar @${username}. Berhasil: ${sukses}, Gagal: ${gagal}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM COMMENT ERROR', msg: err.message });
  }
}
