-- Drop dashboard premium request feature tables and helpers

-- Remove dashboard_premium_audit artifacts
DROP TRIGGER IF EXISTS dashboard_premium_audit_set_updated_at ON dashboard_premium_audit;
DROP FUNCTION IF EXISTS set_dashboard_premium_audit_updated_at();
DROP INDEX IF EXISTS idx_dashboard_premium_audit_request;
DROP TABLE IF EXISTS dashboard_premium_audit;

-- Remove dashboard_premium_request_audit artifacts
DROP INDEX IF EXISTS idx_dashboard_premium_request_audit_request;
DROP TABLE IF EXISTS dashboard_premium_request_audit;

-- Remove dashboard_premium_request artifacts
DROP TRIGGER IF EXISTS dashboard_premium_request_set_updated_at ON dashboard_premium_request;
DROP INDEX IF EXISTS idx_dashboard_premium_request_status_expired_at;
DROP INDEX IF EXISTS idx_dashboard_premium_request_token;
DROP INDEX IF EXISTS idx_dashboard_premium_request_client_id;
DROP INDEX IF EXISTS idx_dashboard_premium_request_user_uuid;
DROP INDEX IF EXISTS idx_dashboard_premium_request_user_id;
DROP INDEX IF EXISTS dashboard_premium_request_user_id_idx;
DROP FUNCTION IF EXISTS set_dashboard_premium_request_updated_at();
DROP TABLE IF EXISTS dashboard_premium_request;
