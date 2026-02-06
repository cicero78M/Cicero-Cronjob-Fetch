import pLimit from 'p-limit';
import { fetchAllInstagramLikesItems } from '../../service/instagramApi.js';
import { upsertInstaLike } from '../../model/instaLikeModel.js';
import { insertIgPostLikeUsers } from '../../model/igPostLikeUserModel.js';
import { upsertIgUser } from '../../model/instaPostExtendedModel.js';
import { getPostIdShortcodePairsTodayByUsername } from '../../model/instaPostExtendedModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

const limit = pLimit(3);
const MAX_LIKE_PAGES = 100;

export async function handleFetchLikesInstagramDM(username) {
  try {
    const posts = await getPostIdShortcodePairsTodayByUsername(username);
    if (!posts.length) {
      sendDebug({ tag: 'IG DM LIKES', msg: `Tidak ada post IG hari ini untuk @${username}` });
      return;
    }
    let sukses = 0, gagal = 0;
    const tasks = [];
    for (const p of posts) {
      const task = limit(async () => {
        try {
          const likes = await fetchAllInstagramLikesItems(p.post_id, MAX_LIKE_PAGES);
          const usernames = likes.map(l => l?.username).filter(Boolean);
          await upsertInstaLike(p.shortcode, usernames);
          for (const u of likes) {
            await upsertIgUser(u);
          }
          await insertIgPostLikeUsers(p.post_id, likes);
          sukses++;
        } catch (err) {
          gagal++;
          sendDebug({ tag: 'IG DM LIKES ERROR', msg: `[${p.shortcode}] ${err.message}` });
        }
      });
      tasks.push(task);
    }
    await Promise.all(tasks);
    sendDebug({ tag: 'IG DM LIKES', msg: `Selesai likes @${username}. Berhasil: ${sukses}, Gagal: ${gagal}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM LIKES ERROR', msg: err.message });
  }
}
