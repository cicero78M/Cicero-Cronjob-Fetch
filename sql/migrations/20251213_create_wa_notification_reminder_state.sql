CREATE TABLE IF NOT EXISTS wa_notification_reminder_state (
  reminder_state_id SERIAL PRIMARY KEY,
  date_key DATE NOT NULL,
  chat_id TEXT NOT NULL,
  last_stage VARCHAR(20) NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (date_key, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_notification_reminder_state_date_chat
  ON wa_notification_reminder_state (date_key, chat_id);

CREATE INDEX IF NOT EXISTS idx_wa_notification_reminder_state_date_status
  ON wa_notification_reminder_state (date_key, is_complete, last_stage);

CREATE OR REPLACE FUNCTION set_wa_notification_reminder_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_notification_reminder_state_set_updated_at ON wa_notification_reminder_state;
CREATE TRIGGER wa_notification_reminder_state_set_updated_at
BEFORE UPDATE ON wa_notification_reminder_state
FOR EACH ROW
EXECUTE PROCEDURE set_wa_notification_reminder_state_updated_at();
