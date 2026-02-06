-- Add role_id to dashboard_user and migrate existing data
ALTER TABLE dashboard_user
  ADD COLUMN IF NOT EXISTS role_id INT REFERENCES roles(role_id);

-- Ensure all roles exist in roles table
INSERT INTO roles (role_name)
SELECT DISTINCT role FROM dashboard_user
ON CONFLICT (role_name) DO NOTHING;

-- Migrate role data
UPDATE dashboard_user du
SET role_id = r.role_id
FROM roles r
WHERE du.role = r.role_name;

-- Enforce not null and drop old column
ALTER TABLE dashboard_user
  ALTER COLUMN role_id SET NOT NULL,
  DROP COLUMN IF EXISTS role;
