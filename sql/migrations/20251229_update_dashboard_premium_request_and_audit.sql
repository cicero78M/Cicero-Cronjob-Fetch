-- Add metadata columns for dashboard_premium_request to support tokenized tracking and admin responses
ALTER TABLE dashboard_premium_request
  ADD COLUMN IF NOT EXISTS request_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS admin_whatsapp TEXT;

UPDATE dashboard_premium_request
SET request_token = gen_random_uuid()
WHERE request_token IS NULL;

ALTER TABLE dashboard_premium_request
ALTER COLUMN request_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_premium_request_token
  ON dashboard_premium_request (request_token);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_status_expired_at
  ON dashboard_premium_request (status, expired_at);

-- New audit table for dashboard premium lifecycle changes
CREATE TABLE IF NOT EXISTS dashboard_premium_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES dashboard_premium_request(request_id) ON DELETE CASCADE,
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  status_from TEXT,
  status_to TEXT,
  admin_whatsapp TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_audit_request
  ON dashboard_premium_audit (request_id);

CREATE OR REPLACE FUNCTION set_dashboard_premium_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_premium_audit_set_updated_at ON dashboard_premium_audit;
CREATE TRIGGER dashboard_premium_audit_set_updated_at
BEFORE UPDATE ON dashboard_premium_audit
FOR EACH ROW
EXECUTE PROCEDURE set_dashboard_premium_audit_updated_at();
