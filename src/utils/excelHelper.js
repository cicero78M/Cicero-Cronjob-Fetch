const MAX_SHEET_NAME_LENGTH = 31;
const INVALID_SHEET_CHARS = new RegExp('[\\\\/?*\\[\\]:]', 'g');

function normalizeBaseName(rawName) {
  const cleaned = String(rawName ?? '')
    .replace(INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length ? cleaned : 'Sheet';
}

export function generateSheetName(rawName, usedNames) {
  if (!usedNames || typeof usedNames.has !== 'function') {
    throw new Error('generateSheetName requires a Set-like usedNames parameter');
  }

  const normalized = normalizeBaseName(rawName);
  const base = normalized.slice(0, MAX_SHEET_NAME_LENGTH).trim() || 'Sheet';

  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    const suffixStr = `_${suffix++}`;
    const maxBaseLength = Math.max(
      MAX_SHEET_NAME_LENGTH - suffixStr.length,
      1
    );
    const truncated = base.slice(0, maxBaseLength).trim();
    const basePortion = truncated.length
      ? truncated
      : base.slice(0, maxBaseLength).trim();
    candidate = `${basePortion || 'Sheet'.slice(0, maxBaseLength)}${suffixStr}`;
  }

  usedNames.add(candidate);
  return candidate;
}

export default generateSheetName;
