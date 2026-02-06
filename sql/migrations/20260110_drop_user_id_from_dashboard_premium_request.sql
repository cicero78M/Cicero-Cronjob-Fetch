-- Remove legacy user_id reference from dashboard_premium_request
ALTER TABLE dashboard_premium_request
  DROP CONSTRAINT IF EXISTS dashboard_premium_request_user_id_fkey;

DROP INDEX IF EXISTS idx_dashboard_premium_request_user_id;

ALTER TABLE dashboard_premium_request
  DROP COLUMN IF EXISTS user_id;
