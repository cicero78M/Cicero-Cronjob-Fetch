export const JAKARTA_TIMEZONE = "Asia/Jakarta";

function toDate(value = new Date()) {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value ?? Date.now());
}

export function getJakartaNow() {
  return new Date();
}

export function formatJakartaDate(baseDate = getJakartaNow(), locale = "id-ID", options = {}) {
  return toDate(baseDate).toLocaleDateString(locale, {
    timeZone: JAKARTA_TIMEZONE,
    ...options,
  });
}

export function formatJakartaTime(baseDate = getJakartaNow(), locale = "id-ID", options = {}) {
  return toDate(baseDate).toLocaleTimeString(locale, {
    timeZone: JAKARTA_TIMEZONE,
    ...options,
  });
}

export function toJakartaDateKey(baseDate = getJakartaNow()) {
  return formatJakartaDate(baseDate, "en-CA");
}

