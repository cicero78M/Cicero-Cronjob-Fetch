-- Create dashboard_premium_request table for dashboard premium access submissions
CREATE TABLE IF NOT EXISTS dashboard_premium_request (
  request_id SERIAL PRIMARY KEY,
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  user_id TEXT REFERENCES "user"(user_id),
  username TEXT NOT NULL,
  whatsapp TEXT,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  transfer_amount NUMERIC,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
