-- Create dashboard_password_resets table for tracking password reset requests
CREATE TABLE IF NOT EXISTS dashboard_password_resets (
    reset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
    delivery_target TEXT NOT NULL,
    reset_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dashboard_password_resets_user_idx
    ON dashboard_password_resets (dashboard_user_id, expires_at)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS dashboard_password_resets_token_idx
    ON dashboard_password_resets (reset_token);
