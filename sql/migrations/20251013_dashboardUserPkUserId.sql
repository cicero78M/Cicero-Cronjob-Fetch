-- Add dashboard_user_id primary key and optional user_id reference
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE dashboard_user
  DROP CONSTRAINT IF EXISTS dashboard_user_pkey;

ALTER TABLE dashboard_user
  ALTER COLUMN user_id TYPE VARCHAR,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE dashboard_user
  ADD COLUMN IF NOT EXISTS dashboard_user_id UUID DEFAULT gen_random_uuid();

UPDATE dashboard_user
SET dashboard_user_id = gen_random_uuid()
WHERE dashboard_user_id IS NULL;

ALTER TABLE dashboard_user
  ADD CONSTRAINT dashboard_user_pkey PRIMARY KEY (dashboard_user_id);

ALTER TABLE dashboard_user
  ADD CONSTRAINT dashboard_user_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES "user"(user_id);
