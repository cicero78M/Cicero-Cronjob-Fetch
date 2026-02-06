// src/utils/sqlPriority.js
import { PRIORITY_USER_NAMES } from './constants.js';

const PRIORITY_NAMES_UPPER = PRIORITY_USER_NAMES.map((name) => name.toUpperCase());
const SQL_FALLBACK_RANK = PRIORITY_NAMES_UPPER.length + 1;

export function getNamaPriorityIndex(nama) {
  const normalized = (nama || '').toString().trim().toUpperCase();
  const idx = PRIORITY_NAMES_UPPER.indexOf(normalized);
  return idx === -1 ? PRIORITY_NAMES_UPPER.length : idx;
}

export function buildPriorityOrderClause(columnSql, pushParam) {
  const whenClauses = PRIORITY_NAMES_UPPER.map((name, index) => {
    const paramIndex = pushParam(name);
    return `WHEN UPPER(${columnSql}) = $${paramIndex} THEN ${index + 1}`;
  });

  const priorityCase = `CASE
      ${whenClauses.join('\n      ')}
      ELSE ${SQL_FALLBACK_RANK}
    END`;

  return { priorityCase, fallbackRank: SQL_FALLBACK_RANK };
}
