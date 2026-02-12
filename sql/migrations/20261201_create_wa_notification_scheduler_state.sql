CREATE TABLE IF NOT EXISTS wa_notification_scheduler_state (
  client_id TEXT PRIMARY KEY,
  last_ig_count INTEGER NOT NULL DEFAULT 0,
  last_tiktok_count INTEGER NOT NULL DEFAULT 0,
  last_notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_notification_scheduler_state_last_notified_at
  ON wa_notification_scheduler_state (last_notified_at);
