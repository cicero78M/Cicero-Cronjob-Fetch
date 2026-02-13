ALTER TABLE wa_notification_scheduler_state
  ADD COLUMN IF NOT EXISTS last_notified_slot TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_notification_scheduler_state_last_notified_slot
  ON wa_notification_scheduler_state (last_notified_slot);
