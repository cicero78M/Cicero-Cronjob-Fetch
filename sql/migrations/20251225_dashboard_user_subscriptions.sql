CREATE TABLE IF NOT EXISTS dashboard_user_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_user_id UUID NOT NULL REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  canceled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_subscriptions_user_status_expires
  ON dashboard_user_subscriptions (dashboard_user_id, status, expires_at);

ALTER TABLE dashboard_user
  ADD COLUMN IF NOT EXISTS premium_status BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS premium_tier TEXT,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE;
