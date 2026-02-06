// src/utils/tiktokHelper.js

const VIDEO_ID_PATTERNS = [
  /video\/(\d{8,21})/i,
  /[?&](?:video_id|videoId|item_id|itemId)=(\d{8,21})/,
  /share_video_id=(\d{8,21})/,
  /(?:^|\b)(\d{8,21})(?:\b|$)/,
];

export function extractVideoId(input) {
  if (!input && input !== 0) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  if (/^\d{6,}$/.test(raw)) {
    return raw;
  }

  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  try {
    const url = new URL(raw);
    const direct = url.pathname.match(/video\/(\d{8,21})/i);
    if (direct?.[1]) return direct[1];
    const params = url.searchParams;
    const keys = ["video_id", "videoId", "item_id", "itemId", "share_video_id"];
    for (const key of keys) {
      const value = params.get(key);
      if (value && /^\d{6,}$/.test(value)) {
        return value;
      }
    }
  } catch {
    // Not a URL, ignore
  }

  return "";
}
