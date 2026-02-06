import { query } from './db.js';

function splitRecipientField(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
  }

  if (!rawValue) return [];

  return String(rawValue)
    .split(/[;,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function getClientContactsById(clientId) {
  const { rows } = await query(
    `SELECT client_super, client_operator, client_group
     FROM clients
     WHERE LOWER(client_id) = LOWER($1)
     LIMIT 1`,
    [clientId]
  );

  const [clientRow] = rows || [];

  return {
    clientSuper: splitRecipientField(clientRow?.client_super),
    clientOperator: splitRecipientField(clientRow?.client_operator),
    clientGroup: splitRecipientField(clientRow?.client_group),
  };
}

export { splitRecipientField };
