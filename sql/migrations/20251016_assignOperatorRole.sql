INSERT INTO roles (role_name) VALUES ('operator') ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM "user" u
JOIN roles r ON r.role_name = 'operator'
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
);
