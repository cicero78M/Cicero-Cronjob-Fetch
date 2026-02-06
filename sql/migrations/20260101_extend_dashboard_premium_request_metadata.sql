-- Extend dashboard_premium_request to capture dashboard form identifiers and tier

ALTER TABLE dashboard_premium_request
  ADD COLUMN IF NOT EXISTS premium_tier TEXT,
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS user_uuid TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_client_id
  ON dashboard_premium_request (client_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_user_uuid
  ON dashboard_premium_request (user_uuid);
