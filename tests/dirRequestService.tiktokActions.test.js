import { readFileSync } from 'fs';
import path from 'path';

const servicePath = path.resolve('src/service/dirRequestService.js');
const serviceSource = readFileSync(servicePath, 'utf8');

describe('dirRequestService TikTok menu actions', () => {
  test('action 14 uses existing TikTok fetch post and comment handlers', () => {
    expect(serviceSource).toContain(
      'const { fetchAndStoreTiktokContent } = await import('
    );
    expect(serviceSource).toContain(
      '"../handler/fetchpost/tiktokFetchPost.js"'
    );
    expect(serviceSource).toContain(
      'const { handleFetchKomentarTiktokBatch } = await import('
    );
    expect(serviceSource).toContain(
      '"../handler/fetchengagement/fetchCommentTiktok.js"'
    );
    expect(serviceSource).toContain(
      'await fetchAndStoreTiktokContent(targetId, waClient, chatId);'
    );
    expect(serviceSource).toContain(
      'await handleFetchKomentarTiktokBatch(waClient, chatId, targetId);'
    );
  });

  test('action 16 uses existing TikTok post fetch handler with consistent signature', () => {
    expect(serviceSource).toContain(
      'await fetchAndStoreTiktokContent(targetId, waClient, chatId);'
    );
    expect(serviceSource).not.toContain('fetchAndStoreTiktokPostsFull');
    expect(serviceSource).not.toContain('fetchAndStoreTiktokPosts(waClient, chatId, targetId)');
  });
});
