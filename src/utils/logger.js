import { formatJakartaIsoTimestamp } from './jakartaDateTime.js';
const originalLog = console.log;

console.log = (...args) => {
  const timestamp = formatJakartaIsoTimestamp(new Date()) || new Date().toISOString();
  originalLog(`[${timestamp}]`, ...args);
};
