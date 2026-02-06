import { jest } from '@jest/globals';

const mockFindAllActive = jest.fn();
const mockFindById = jest.fn();
const mockUpsertProfile = jest.fn();
const mockFindProfileByUsername = jest.fn();
const mockGetPostsToday = jest.fn();
const mockFindInstaByClient = jest.fn();
const mockGetTiktokPostsToday = jest.fn();
const mockFindTiktokByClient = jest.fn();
const mockFetchInstagramProfile = jest.fn();
const mockFetchAndStoreInstaContent = jest.fn();
const mockFetchAndStoreTiktokContent = jest.fn();
const mockFetchTiktokProfile = jest.fn();
const mockSendConsoleDebug = jest.fn();

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveDirektoratWithSosmed: mockFindAllActive,
  findById: mockFindById,
}));

jest.unstable_mockModule('../src/service/instaProfileService.js', () => ({
  upsertProfile: mockUpsertProfile,
  findByUsername: mockFindProfileByUsername,
}));

jest.unstable_mockModule('../src/service/instaPostService.js', () => ({
  findByClientId: mockFindInstaByClient,
}));

jest.unstable_mockModule('../src/service/tiktokPostService.js', () => ({
  findByClientId: mockFindTiktokByClient,
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsToday,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetTiktokPostsToday,
}));

jest.unstable_mockModule('../src/service/instagramApi.js', () => ({
  fetchInstagramProfile: mockFetchInstagramProfile,
}));

jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchAndStoreInstaContent,
}));

jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchAndStoreTiktokContent,
}));

jest.unstable_mockModule('../src/service/tiktokRapidService.js', () => ({
  fetchTiktokProfile: mockFetchTiktokProfile,
}));

jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: mockSendConsoleDebug,
}));

let refreshAggregatorData;

function setupDefaultMocks() {
  mockFindAllActive.mockResolvedValue([
    { client_id: 'DITA', nama: 'Direktorat A' },
    { client_id: 'DITB', nama: 'Direktorat B' },
  ]);

  mockFindById.mockImplementation(async (id) => {
    if (id === 'DITA') {
      return {
        client_id: 'DITA',
        client_insta: 'dita.ig',
        client_insta_status: true,
        client_tiktok: 'dita.tt',
        client_tiktok_status: true,
      };
    }
    if (id === 'DITB') {
      return {
        client_id: 'DITB',
        client_insta: 'ditb.ig',
        client_insta_status: true,
        client_tiktok: 'ditb.tt',
        client_tiktok_status: true,
      };
    }
    return null;
  });

  mockFetchInstagramProfile.mockResolvedValue({
    username: 'dita.ig',
    full_name: 'Dita',
    followers_count: 10,
    following_count: 5,
    media_count: 2,
    profile_pic_url: 'pic.jpg',
  });

  mockFetchTiktokProfile.mockResolvedValue({ username: 'dita.tt' });

  mockFindProfileByUsername.mockResolvedValue({ username: 'dita.ig', full_name: 'Dita' });
  mockGetPostsToday.mockResolvedValue([{ shortcode: 's1' }]);
  mockFindInstaByClient.mockResolvedValue([{ shortcode: 'sA' }, { shortcode: 'sB' }]);
  mockGetTiktokPostsToday.mockResolvedValue([{ video_id: 'v1' }]);
  mockFindTiktokByClient.mockResolvedValue([{ video_id: 'vA' }]);
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockFetchAndStoreTiktokContent.mockResolvedValue();
  mockUpsertProfile.mockResolvedValue();
  mockSendConsoleDebug.mockReturnValue();
}

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  setupDefaultMocks();
  ({ refreshAggregatorData } = await import('../src/service/aggregatorService.js'));
});

describe('refreshAggregatorData', () => {
  test('refreshes eligible directorate clients with daily posts', async () => {
    const results = await refreshAggregatorData({ periode: 'harian', limit: 5 });

    expect(mockFindAllActive).toHaveBeenCalled();
    expect(mockFetchAndStoreInstaContent).toHaveBeenCalledTimes(2);
    expect(mockFetchAndStoreTiktokContent).toHaveBeenCalledTimes(2);
    expect(mockGetPostsToday).toHaveBeenCalledWith('DITA');
    expect(mockGetPostsToday).toHaveBeenCalledWith('DITB');
    expect(mockGetTiktokPostsToday).toHaveBeenCalledWith('DITA');
    expect(mockGetTiktokPostsToday).toHaveBeenCalledWith('DITB');
    expect(mockUpsertProfile).toHaveBeenCalled();
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(
      expect.objectContaining({ client_id: 'DITA', igPosts: [{ shortcode: 's1' }] })
    );
  });

  test('throws when client is not eligible for refresh', async () => {
    mockFindAllActive.mockResolvedValue([{ client_id: 'DITA' }]);

    await expect(
      refreshAggregatorData({ clientId: 'UNKNOWN', periode: 'harian', limit: 3 })
    ).rejects.toThrow('client not found');
  });

  test('uses full history mode when periode is riwayat', async () => {
    const results = await refreshAggregatorData({ clientId: 'DITA', periode: 'riwayat', limit: 2 });

    expect(mockFindInstaByClient).toHaveBeenCalledWith('DITA');
    expect(mockFindTiktokByClient).toHaveBeenCalledWith('DITA');
    expect(mockGetPostsToday).not.toHaveBeenCalled();
    expect(mockGetTiktokPostsToday).not.toHaveBeenCalled();
    expect(results[0].igPosts).toEqual([{ shortcode: 'sA' }, { shortcode: 'sB' }]);
  });

  test('skips upstream post refresh when skipPostRefresh is true', async () => {
    const results = await refreshAggregatorData({
      clientId: 'DITA',
      periode: 'harian',
      limit: 3,
      skipPostRefresh: true,
    });

    expect(mockFetchAndStoreInstaContent).not.toHaveBeenCalled();
    expect(mockFetchAndStoreTiktokContent).not.toHaveBeenCalled();
    expect(mockGetPostsToday).toHaveBeenCalledWith('DITA');
    expect(mockGetTiktokPostsToday).toHaveBeenCalledWith('DITA');
    expect(results[0]).toEqual(
      expect.objectContaining({ client_id: 'DITA', igPosts: [{ shortcode: 's1' }] })
    );
  });
});
