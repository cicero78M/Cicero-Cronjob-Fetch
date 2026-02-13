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

function normalizeClientId(clientId) {
  return String(clientId || '').trim().toUpperCase();
}

function normalizeSchedulerStateRow(row) {
  const clientId = normalizeClientId(row.client_id);
  return {
    clientId,
    lastIgCount: Number(row.last_ig_count || 0),
    lastTiktokCount: Number(row.last_tiktok_count || 0),
    lastNotifiedAt: row.last_notified_at || null,
    lastNotifiedSlot: row.last_notified_slot || null,
  };
}

export async function getSchedulerStateMapByClientIds(clientIds = []) {
  const normalizedIds = Array.from(
    new Set(
      (clientIds || [])
        .map((clientId) => normalizeClientId(clientId))
        .filter(Boolean)
    )
  );

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const res = await query(
    `SELECT client_id, last_ig_count, last_tiktok_count, last_notified_at, last_notified_slot
     FROM wa_notification_scheduler_state
     WHERE client_id = ANY($1::text[])`,
    [normalizedIds]
  );

  const stateMap = new Map();
  res.rows.forEach((row) => {
    const state = normalizeSchedulerStateRow(row);
    stateMap.set(state.clientId, state);
  });

  return stateMap;
}

export async function upsertSchedulerState({
  clientId,
  lastIgCount,
  lastTiktokCount,
  lastNotifiedAt,
  lastNotifiedSlot,
}) {
  const normalizedClientId = normalizeClientId(clientId);
  if (!normalizedClientId) return null;

  const lastIgValue = Number(lastIgCount || 0);
  const lastTiktokValue = Number(lastTiktokCount || 0);
  const notifiedAtValue = lastNotifiedAt || null;
  const notifiedSlotValue = lastNotifiedSlot || null;

  const res = await query(
    `INSERT INTO wa_notification_scheduler_state (
      client_id,
      last_ig_count,
      last_tiktok_count,
      last_notified_at,
      last_notified_slot
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (client_id) DO UPDATE
      SET last_ig_count = EXCLUDED.last_ig_count,
          last_tiktok_count = EXCLUDED.last_tiktok_count,
          last_notified_at = EXCLUDED.last_notified_at,
          last_notified_slot = EXCLUDED.last_notified_slot,
          updated_at = NOW()
    RETURNING client_id, last_ig_count, last_tiktok_count, last_notified_at, last_notified_slot`,
    [normalizedClientId, lastIgValue, lastTiktokValue, notifiedAtValue, notifiedSlotValue]
  );

  return normalizeSchedulerStateRow(res.rows[0]);
}
