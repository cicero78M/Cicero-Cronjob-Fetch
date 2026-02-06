-- Remove unused user_id link from dashboard_user
ALTER TABLE dashboard_user
  DROP CONSTRAINT IF EXISTS dashboard_user_user_id_fkey;

ALTER TABLE dashboard_user
  DROP COLUMN IF EXISTS user_id;
