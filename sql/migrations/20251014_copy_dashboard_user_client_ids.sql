CREATE TABLE IF NOT EXISTS dashboard_user_clients (
    dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
    client_id VARCHAR REFERENCES clients(client_id) ON DELETE CASCADE,
    PRIMARY KEY (dashboard_user_id, client_id)
);

INSERT INTO dashboard_user_clients (dashboard_user_id, client_id)
SELECT dashboard_user_id, client_id
FROM dashboard_user
WHERE client_id IS NOT NULL;

-- Insert default client for users without one. Expect the application to
-- provide the default via the `app.default_client_id` setting.
INSERT INTO dashboard_user_clients (dashboard_user_id, client_id)
SELECT dashboard_user_id, current_setting('app.default_client_id', false)
FROM dashboard_user
WHERE client_id IS NULL;

ALTER TABLE dashboard_user DROP COLUMN IF EXISTS client_id;
