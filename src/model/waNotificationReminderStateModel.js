import { query } from '../repository/db.js';

export async function getReminderStateMapForDate(dateKey) {
  if (!dateKey) return new Map();
  const res = await query(
    `SELECT chat_id, client_id, last_stage, is_complete
     FROM wa_notification_reminder_state
     WHERE date_key = $1`,
    [dateKey]
  );

  const stateMap = new Map();
  res.rows.forEach((row) => {
    const clientId = (row.client_id || '').toString().trim().toUpperCase();
    const key = `${row.chat_id}:${clientId}`;
    stateMap.set(key, {
      chatId: row.chat_id,
      clientId,
      lastStage: row.last_stage,
      isComplete: row.is_complete,
    });
  });

  return stateMap;
}

export async function upsertReminderState({
  dateKey,
  chatId,
  clientId,
  lastStage,
  isComplete,
}) {
  if (!dateKey || !chatId || !clientId) return null;
  const stage = lastStage || 'initial';
  const completeFlag = Boolean(isComplete);
  const normalizedClientId = clientId.toString().trim().toUpperCase();

  await query(
    `INSERT INTO wa_notification_reminder_state (date_key, chat_id, client_id, last_stage, is_complete)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (date_key, chat_id, client_id) DO UPDATE
       SET last_stage = EXCLUDED.last_stage,
           is_complete = EXCLUDED.is_complete,
           updated_at = NOW()`,
    [dateKey, chatId, normalizedClientId, stage, completeFlag]
  );

  return {
    chatId,
    clientId: normalizedClientId,
    lastStage: stage,
    isComplete: completeFlag,
  };
}

export async function deleteReminderStateForDate(dateKey) {
  if (!dateKey) return 0;
  const res = await query(
    'DELETE FROM wa_notification_reminder_state WHERE date_key = $1',
    [dateKey]
  );
  return res.rowCount || 0;
}
