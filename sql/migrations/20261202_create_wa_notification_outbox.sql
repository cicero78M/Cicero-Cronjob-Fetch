CREATE TABLE IF NOT EXISTS wa_notification_outbox (
  outbox_id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  message TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_notification_outbox_dispatch
  ON wa_notification_outbox (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_wa_notification_outbox_client
  ON wa_notification_outbox (client_id, status);

CREATE OR REPLACE FUNCTION set_wa_notification_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_notification_outbox_set_updated_at ON wa_notification_outbox;
CREATE TRIGGER wa_notification_outbox_set_updated_at
BEFORE UPDATE ON wa_notification_outbox
FOR EACH ROW
EXECUTE PROCEDURE set_wa_notification_outbox_updated_at();


INSERT INTO cron_job_config (job_key, display_name)
VALUES ('./src/cron/cronWaOutboxWorker.js', 'WhatsApp Notification Outbox Worker')
ON CONFLICT (job_key) DO NOTHING;
