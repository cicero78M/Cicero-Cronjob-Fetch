const originalLog = console.log;
const jakartaTimeZone = 'Asia/Jakarta';
const jakartaUtcOffset = '+07:00';

const jakartaFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: jakartaTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const formatJakartaTimestamp = (date) => {
  const parts = jakartaFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${milliseconds}${jakartaUtcOffset}`;
};

console.log = (...args) => {
  const timestamp = formatJakartaTimestamp(new Date());
  originalLog(`[${timestamp}]`, ...args);
};
