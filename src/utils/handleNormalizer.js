// src/utils/handleNormalizer.js

const SUPPORTED_PROFILE_HOSTS = ["instagram.com", "tiktok.com"];

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function sanitizeHandleCandidate(segment) {
  if (!segment) return "";
  const decoded = decodeSegment(segment);
  const trimmed = decoded.trim();
  const withoutAt = trimmed.replace(/^@+/, "");
  const cleaned = withoutAt
    .replace(/^[^A-Za-z0-9._-]+/, "")
    .replace(/[^A-Za-z0-9._-]+$/, "");
  if (!cleaned) return "";
  const base = cleaned.split(/[/?#]/)[0];
  if (!base) return "";
  return base.replace(/[^A-Za-z0-9._-]/g, "");
}

function pickHandleFromSegments(hostname, segments) {
  if (!segments.length) return "";
  const directSegment = segments.find((segment) => segment.startsWith("@"));
  if (directSegment) {
    return sanitizeHandleCandidate(directSegment);
  }

  if (segments.length === 1) {
    return sanitizeHandleCandidate(segments[0]);
  }

  if (segments.length >= 2 && segments[0].toLowerCase() === "u") {
    return sanitizeHandleCandidate(segments[1]);
  }

  // TikTok profile URLs may include additional segments (e.g. /@user/video/...)
  if (hostname.endsWith("tiktok.com")) {
    const fromTiktokPath = [...segments]
      .reverse()
      .find((segment) => segment.startsWith("@"));
    if (fromTiktokPath) {
      return sanitizeHandleCandidate(fromTiktokPath);
    }
  }

  return "";
}

function extractHandleFromUrl(value) {
  if (!value) return "";
  let input = value;
  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!SUPPORTED_PROFILE_HOSTS.some((host) => hostname.endsWith(host))) {
      return "";
    }

    const segments = url.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    const candidate = pickHandleFromSegments(hostname, segments);
    return candidate;
  } catch {
    return "";
  }
}

function looksLikeSupportedProfileUrl(value) {
  return /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|tiktok\.com)\b/i.test(
    value
  );
}

export function normalizeHandleValue(value) {
  if (value === undefined || value === null) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const collapsed = trimmed.replace(/@\s+/g, "@").replace(/\s+/g, "");
  if (!collapsed) return "";

  const fromUrl = extractHandleFromUrl(collapsed);
  let candidate = fromUrl;
  if (!candidate) {
    if (looksLikeSupportedProfileUrl(collapsed)) {
      candidate = "";
    } else {
      candidate = sanitizeHandleCandidate(collapsed);
    }
  }

  if (!candidate) return "";
  return `@${candidate.toLowerCase()}`;
}

export function extractHandleFromProfileUrl(value) {
  return extractHandleFromUrl(value);
}

