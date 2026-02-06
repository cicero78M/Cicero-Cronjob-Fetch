-- Create roles and user_roles tables and remove old directorate columns
CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR UNIQUE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR REFERENCES "user"(user_id),
  role_id INTEGER REFERENCES roles(role_id),
  PRIMARY KEY (user_id, role_id)
);

ALTER TABLE "user"
  DROP COLUMN IF EXISTS ditbinmas,
  DROP COLUMN IF EXISTS ditlantas,
  DROP COLUMN IF EXISTS bidhumas;
