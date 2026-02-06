INSERT INTO roles (role_name) VALUES
  ('ditbinmas'),
  ('ditlantas'),
  ('bidhumas')
ON CONFLICT (role_name) DO NOTHING;
