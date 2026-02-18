import { normalizeHandleValue } from "./handleNormalizer.js";

const USERNAME_PATH_CANDIDATES = [
  ["user", "unique_id"],
  ["user", "uniqueId"],
  ["user", "username"],
  ["user", "user_name"],
  ["user", "userName"],
  ["username"],
  ["unique_id"],
  ["uniqueId"],
  ["author", "unique_id"],
  ["author", "uniqueId"],
  ["author", "username"],
  ["author", "user_name"],
  ["author", "userName"],
  ["author_user_name"],
  ["author_username"],
  ["owner", "unique_id"],
  ["owner", "uniqueId"],
  ["owner", "username"],
  ["owner", "user_name"],
  ["owner", "userName"],
  ["user_unique_id"],
  ["userUniqueId"],
];

const COMMENT_CHILDREN_KEYS = [
  "replies",
  "reply_comment",
  "reply_comments",
  "comment_replies",
  "comments",
  "children",
  "items",
  "sub_comments",
  "subComments",
];

function getNestedValue(source, path) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = current[key];
  }
  return current;
}

export function normalizeTiktokCommentUsername(value) {
  return normalizeHandleValue(value) || null;
}

export function extractUsernameFromComment(comment) {
  for (const path of USERNAME_PATH_CANDIDATES) {
    const candidate = getNestedValue(comment, path);
    const normalized = normalizeTiktokCommentUsername(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function collectCommentChildren(comment) {
  if (!comment || typeof comment !== "object") return [];
  return COMMENT_CHILDREN_KEYS.flatMap((key) => {
    const value = comment[key];
    return Array.isArray(value) ? value : [];
  });
}

export function extractUsernamesFromCommentTree(comments = []) {
  const queue = Array.isArray(comments) ? [...comments] : [];
  const usernames = [];

  while (queue.length > 0) {
    const comment = queue.shift();
    const username = extractUsernameFromComment(comment);
    if (username) {
      usernames.push(username);
    }
    queue.push(...collectCommentChildren(comment));
  }

  return [...new Set(usernames)];
}

