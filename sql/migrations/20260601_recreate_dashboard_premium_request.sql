-- Recreate dashboard_premium_request schema with audit trail and expiry tracking
CREATE TABLE IF NOT EXISTS dashboard_premium_request (
  request_id SERIAL PRIMARY KEY,
  request_token UUID NOT NULL DEFAULT gen_random_uuid(),
  dashboard_user_id UUID NOT NULL REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
  client_id VARCHAR REFERENCES clients(client_id),
  username TEXT NOT NULL,
  whatsapp TEXT,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  transfer_amount NUMERIC,
  premium_tier TEXT,
  proof_url TEXT,
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expired_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  admin_whatsapp TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_premium_request_token
  ON dashboard_premium_request (request_token);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_status_expired
  ON dashboard_premium_request (status, expired_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_user_status
  ON dashboard_premium_request (dashboard_user_id, status);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_client
  ON dashboard_premium_request (client_id);

CREATE OR REPLACE FUNCTION set_dashboard_premium_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_premium_request_set_updated_at ON dashboard_premium_request;
CREATE TRIGGER dashboard_premium_request_set_updated_at
BEFORE UPDATE ON dashboard_premium_request
FOR EACH ROW
EXECUTE PROCEDURE set_dashboard_premium_request_updated_at();

CREATE TABLE IF NOT EXISTS dashboard_premium_request_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES dashboard_premium_request(request_id) ON DELETE CASCADE,
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  status_from TEXT,
  status_to TEXT,
  admin_whatsapp TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_audit_request
  ON dashboard_premium_request_audit (request_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_audit_action
  ON dashboard_premium_request_audit (action);

CREATE OR REPLACE FUNCTION set_dashboard_premium_request_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_premium_request_audit_set_updated_at ON dashboard_premium_request_audit;
CREATE TRIGGER dashboard_premium_request_audit_set_updated_at
BEFORE UPDATE ON dashboard_premium_request_audit
FOR EACH ROW
EXECUTE PROCEDURE set_dashboard_premium_request_audit_updated_at();
