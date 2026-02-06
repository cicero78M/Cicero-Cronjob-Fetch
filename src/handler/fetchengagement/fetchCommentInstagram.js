import pLimit from 'p-limit';
import { query } from '../../db/index.js';
import { sendDebug } from '../../middleware/debugHandler.js';
import { fetchAllInstagramComments } from '../../service/instagramApi.js';
import { insertIgPostComments } from '../../model/igPostCommentModel.js';
import { upsertIgUser } from '../../model/instaPostExtendedModel.js';
import * as clientService from '../../service/clientService.js';

const limit = pLimit(3);

export async function handleFetchKomentarInstagram(waClient = null, chatId = null, client_id = null) {
  try {
    const clientName = client_id ? (await clientService.findClientById(client_id))?.nama || '' : '';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const { rows } = await query(
      `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
      [client_id, `${yyyy}-${mm}-${dd}`]
    );
    const shortcodes = rows.map((r) => r.shortcode);
    if (!shortcodes.length) {
      if (waClient && chatId)
        await waClient.sendMessage(chatId, `Tidak ada konten IG hari ini untuk client ${clientName || client_id}.`);
      sendDebug({ tag: 'IG COMMENT', msg: `Tidak ada post IG client ${client_id} hari ini.`, client_id, clientName });
      return;
    }
    let sukses = 0,
      gagal = 0;
    for (const sc of shortcodes) {
      await limit(async () => {
        try {
          const comments = await fetchAllInstagramComments(sc);
          for (const c of comments) {
            if (c.user) await upsertIgUser(c.user);
          }
          await insertIgPostComments(sc, comments);
          sukses++;
          sendDebug({
            tag: 'IG COMMENT',
            msg: `Shortcode ${sc} berhasil simpan komentar (${comments.length})`,
            client_id,
            clientName,
          });
        } catch (err) {
          gagal++;
          sendDebug({
            tag: 'IG COMMENT ERROR',
            msg: `Gagal shortcode ${sc}: ${(err && err.message) || String(err)}`,
            client_id,
            clientName,
          });
        }
      });
    }
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch komentar IG client ${clientName || client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
      );
    }
  } catch (err) {
    const clientName = client_id ? (await clientService.findClientById(client_id))?.nama || '' : '';
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `❌ Error utama fetch komentar IG: ${(err && err.message) || String(err)}`
      );
    }
    sendDebug({ tag: 'IG COMMENT ERROR', msg: (err && err.message) || String(err), client_id, clientName });
  }
}
