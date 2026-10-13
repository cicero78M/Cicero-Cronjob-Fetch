import { query } from '../repository/db.js';

export async function recordOperation(service, status, details = {}) {
  try {
    await query(
      `INSERT INTO cicero_operation_monitor (service, client_id, status, message, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [service, details.clientId || null, status, details.message || null, JSON.stringify(details.metadata || {})],
    );
  } catch (error) {
    console.warn(`[IOT] telemetry ${service} ${status} skipped: ${error?.message || error}`);
  }
}
