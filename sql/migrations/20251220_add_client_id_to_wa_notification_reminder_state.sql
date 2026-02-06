BEGIN;

ALTER TABLE wa_notification_reminder_state
  ADD COLUMN IF NOT EXISTS client_id TEXT;

UPDATE wa_notification_reminder_state
SET client_id = 'UNKNOWN'
WHERE client_id IS NULL OR client_id = '';

ALTER TABLE wa_notification_reminder_state
  ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE wa_notification_reminder_state
  DROP CONSTRAINT IF EXISTS wa_notification_reminder_state_date_key_chat_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wa_notification_reminder_state_date_key_chat_id_client_id_key'
  ) THEN
    ALTER TABLE wa_notification_reminder_state
      ADD CONSTRAINT wa_notification_reminder_state_date_key_chat_id_client_id_key
      UNIQUE (date_key, chat_id, client_id);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_wa_notification_reminder_state_date_chat;
CREATE INDEX IF NOT EXISTS idx_wa_notification_reminder_state_date_chat_client
  ON wa_notification_reminder_state (date_key, chat_id, client_id);

COMMIT;
