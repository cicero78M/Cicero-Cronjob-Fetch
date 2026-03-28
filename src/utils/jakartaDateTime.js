const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

const JAKARTA_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: JAKARTA_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toDate(value = new Date()) {
  return value instanceof Date ? value : new Date(value ?? Date.now());
}

export function getJakartaNowParts(baseDate = new Date()) {
  const date = toDate(baseDate);
  if (Number.isNaN(date.getTime())) {
    return {
      year: NaN,
      month: NaN,
      day: NaN,
      hour: NaN,
      minute: NaN,
      second: NaN,
      weekday: NaN,
    };
  }

  const parts = JAKARTA_PARTS_FORMATTER.formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: WEEKDAY_TO_INDEX[values.weekday],
  };
}

export function formatJakartaDate(baseDate = new Date(), locale = 'id-ID', options = {}) {
  return toDate(baseDate).toLocaleDateString(locale, {
    timeZone: JAKARTA_TIME_ZONE,
    ...options,
  });
}

export function formatJakartaTime(baseDate = new Date(), locale = 'id-ID', options = {}) {
  return toDate(baseDate).toLocaleTimeString(locale, {
    timeZone: JAKARTA_TIME_ZONE,
    ...options,
  });
}

export { JAKARTA_TIME_ZONE };
