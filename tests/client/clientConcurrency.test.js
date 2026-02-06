import { jest } from '@jest/globals';
import { performance } from 'node:perf_hooks';

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const mockFindClientById = jest.fn();
const mockFindUsersByClientId = jest.fn();
const mockInstaPostsByClientId = jest.fn();
const mockFindLikesByShortcode = jest.fn();
const mockTiktokPostsByClientId = jest.fn();
const mockFindCommentsByVideoId = jest.fn();

jest.unstable_mockModule('../../src/model/clientModel.js', () => ({
  findById: mockFindClientById,
}));

jest.unstable_mockModule('../../src/model/userModel.js', () => ({
  findUsersByClientId: mockFindUsersByClientId,
}));

jest.unstable_mockModule('../../src/service/instaPostService.js', () => ({
  findByClientId: mockInstaPostsByClientId,
}));

jest.unstable_mockModule('../../src/service/instaLikeService.js', () => ({
  findByShortcode: mockFindLikesByShortcode,
}));

jest.unstable_mockModule('../../src/service/tiktokPostService.js', () => ({
  findByClientId: mockTiktokPostsByClientId,
}));

jest.unstable_mockModule('../../src/service/tiktokCommentService.js', () => ({
  findByVideoId: mockFindCommentsByVideoId,
}));

let getClientSummary;
let getInstagramLikes;
let getTiktokComments;

beforeAll(async () => {
  ({ getClientSummary } = await import('../../src/service/clientService.js'));
  ({ getInstagramLikes, getTiktokComments } = await import(
    '../../src/controller/clientController.js'
  ));
});

beforeEach(() => {
  jest.useRealTimers();
  mockFindClientById.mockReset();
  mockFindUsersByClientId.mockReset();
  mockInstaPostsByClientId.mockReset();
  mockFindLikesByShortcode.mockReset();
  mockTiktokPostsByClientId.mockReset();
  mockFindCommentsByVideoId.mockReset();
});

const buildResponse = () => {
  const json = jest.fn();
  const res = {
    status: jest.fn().mockReturnThis(),
    json,
  };
  return { res, json };
};

describe('client data concurrency improvements', () => {
  test('getClientSummary fetches social metrics concurrently', async () => {
    const client = { client_id: 'client-1' };
    mockFindClientById.mockResolvedValue(client);
    mockFindUsersByClientId.mockResolvedValue([{ user_id: 1 }, { user_id: 2 }]);

    const instaPosts = Array.from({ length: 5 }, (_, idx) => ({
      shortcode: `short-${idx}`,
    }));
    mockInstaPostsByClientId.mockResolvedValue(instaPosts);
    mockFindLikesByShortcode.mockImplementation(async (shortcode) =>
      delay(50, {
        likes: [`${shortcode}-like-1`, `${shortcode}-like-2`, `${shortcode}-like-3`],
      })
    );

    const tiktokPosts = Array.from({ length: 5 }, (_, idx) => ({
      video_id: `video-${idx}`,
    }));
    mockTiktokPostsByClientId.mockResolvedValue(tiktokPosts);
    mockFindCommentsByVideoId.mockImplementation(async (videoId) =>
      delay(50, {
        comments: [`${videoId}-comment-1`, `${videoId}-comment-2`],
      })
    );

    const start = performance.now();
    const summary = await getClientSummary('client-1');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(220);
    expect(summary).toEqual({
      client,
      user_count: 2,
      insta_post_count: instaPosts.length,
      tiktok_post_count: tiktokPosts.length,
      total_insta_likes: instaPosts.length * 3,
      total_tiktok_comments: tiktokPosts.length * 2,
    });
  });

  test('getInstagramLikes resolves like lookups concurrently', async () => {
    const posts = Array.from({ length: 5 }, (_, idx) => ({
      shortcode: `short-${idx}`,
    }));
    mockInstaPostsByClientId.mockResolvedValue(posts);
    mockFindLikesByShortcode.mockImplementation(async (shortcode) =>
      delay(50, {
        likes: [`${shortcode}-like-1`, `${shortcode}-like-2`],
      })
    );

    const req = { params: { client_id: 'client-1' } };
    const { res, json } = buildResponse();
    const next = jest.fn();

    const start = performance.now();
    await getInstagramLikes(req, res, next);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: posts.map((post) => ({
        shortcode: post.shortcode,
        like_count: 2,
        likes: [`${post.shortcode}-like-1`, `${post.shortcode}-like-2`],
      })),
    });
  });

  test('getTiktokComments batches comment lookups concurrently', async () => {
    const posts = Array.from({ length: 5 }, (_, idx) => ({
      video_id: `video-${idx}`,
    }));
    mockTiktokPostsByClientId.mockResolvedValue(posts);
    mockFindCommentsByVideoId.mockImplementation(async (videoId) =>
      delay(50, {
        comments: [`${videoId}-comment-1`, `${videoId}-comment-2`, `${videoId}-comment-3`],
      })
    );

    const req = { params: { client_id: 'client-1' } };
    const { res, json } = buildResponse();
    const next = jest.fn();

    const start = performance.now();
    await getTiktokComments(req, res, next);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: posts.map((post) => ({
        video_id: post.video_id,
        comment_count: 3,
        comments: [
          `${post.video_id}-comment-1`,
          `${post.video_id}-comment-2`,
          `${post.video_id}-comment-3`,
        ],
      })),
    });
  });
});
