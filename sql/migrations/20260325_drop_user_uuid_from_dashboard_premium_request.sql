-- Remove unused user_uuid column from dashboard_premium_request to align with audit tracking
DROP INDEX IF EXISTS idx_dashboard_premium_request_user_uuid;

ALTER TABLE dashboard_premium_request
  DROP COLUMN IF EXISTS user_uuid;
