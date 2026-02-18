import {
  extractUsernameFromComment,
  extractUsernamesFromCommentTree,
  normalizeTiktokCommentUsername,
} from '../../src/utils/tiktokCommentUsernameExtractor.js';

describe('tiktokCommentUsernameExtractor', () => {
  test('extractUsernameFromComment supports user.unique_id, user.uniqueId, and username', () => {
    expect(
      extractUsernameFromComment({ user: { unique_id: 'User_A' } })
    ).toBe('@user_a');

    expect(
      extractUsernameFromComment({ user: { uniqueId: 'UserB' } })
    ).toBe('@userb');

    expect(
      extractUsernameFromComment({ username: 'UserC' })
    ).toBe('@userc');
  });

  test('extractUsernamesFromCommentTree scans nested replies and deduplicates usernames', () => {
    const comments = [
      {
        user: { unique_id: 'TopUser' },
        replies: [
          { user: { uniqueId: 'ReplyUser' } },
          { username: 'ReplyUser' },
        ],
      },
      {
        author: { username: 'AuthorName' },
        children: [{ owner: { user_name: 'OwnerName' } }],
      },
    ];

    expect(new Set(extractUsernamesFromCommentTree(comments))).toEqual(
      new Set(['@topuser', '@replyuser', '@authorname', '@ownername'])
    );
  });

  test('normalizeTiktokCommentUsername keeps lowercase and @ prefix', () => {
    expect(normalizeTiktokCommentUsername('  ExampleUser  ')).toBe('@exampleuser');
    expect(normalizeTiktokCommentUsername('@AnotherUser')).toBe('@anotheruser');
    expect(normalizeTiktokCommentUsername('')).toBeNull();
  });
});
