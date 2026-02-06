-- Drop legacy user_id columns from dashboard tables now that dashboard_user_id is primary
ALTER TABLE dashboard_premium_request
  DROP CONSTRAINT IF EXISTS dashboard_premium_request_user_id_fkey;

DROP INDEX IF EXISTS idx_dashboard_premium_request_user_id;
DROP INDEX IF EXISTS dashboard_premium_request_user_id_idx;

ALTER TABLE dashboard_premium_request
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE dashboard_user
  DROP CONSTRAINT IF EXISTS dashboard_user_user_id_fkey;

DROP INDEX IF EXISTS idx_dashboard_user_user_id;
DROP INDEX IF EXISTS dashboard_user_user_id_key;

ALTER TABLE dashboard_user
  DROP COLUMN IF EXISTS user_id;
