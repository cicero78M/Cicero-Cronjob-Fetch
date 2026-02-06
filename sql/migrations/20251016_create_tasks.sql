-- Create tasks table for tracking user tasks per post
CREATE TABLE IF NOT EXISTS tasks (
    shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES "user"(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_shortcode_user_idx
    ON tasks (shortcode, user_id, created_at);
