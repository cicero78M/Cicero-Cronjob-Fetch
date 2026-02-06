CREATE TABLE IF NOT EXISTS dashboard_premium_request_audit (
  audit_id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES dashboard_premium_request(request_id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL,
  admin_whatsapp TEXT,
  admin_chat_id TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_audit_request
  ON dashboard_premium_request_audit (request_id);
