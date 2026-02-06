ALTER TABLE dashboard_user DROP COLUMN IF EXISTS client_id;

CREATE TABLE IF NOT EXISTS dashboard_user_clients (
    dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
    client_id VARCHAR REFERENCES clients(client_id) ON DELETE CASCADE,
    PRIMARY KEY (dashboard_user_id, client_id)
);
