-- Migration: Create insta_post_clients junction table to support collaboration posts
-- Date: 2026-02-19
-- Purpose: Allow multiple client_ids to share the same Instagram shortcode (collaboration posts)

-- Create junction table for many-to-many relationship between posts and clients
CREATE TABLE IF NOT EXISTS insta_post_clients (
  shortcode VARCHAR NOT NULL REFERENCES insta_post(shortcode) ON DELETE CASCADE,
  client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (shortcode, client_id)
);

-- Create index for efficient lookups by client_id
CREATE INDEX IF NOT EXISTS idx_insta_post_clients_client_id ON insta_post_clients(client_id);

-- Create index for efficient lookups by shortcode
CREATE INDEX IF NOT EXISTS idx_insta_post_clients_shortcode ON insta_post_clients(shortcode);

-- Migrate existing data: populate junction table from current insta_post.client_id values
INSERT INTO insta_post_clients (shortcode, client_id, created_at)
SELECT shortcode, client_id, created_at
FROM insta_post
WHERE client_id IS NOT NULL
ON CONFLICT (shortcode, client_id) DO NOTHING;

-- Comment on table
COMMENT ON TABLE insta_post_clients IS 'Junction table mapping Instagram posts to multiple clients for collaboration posts';
COMMENT ON COLUMN insta_post_clients.shortcode IS 'Instagram post shortcode (unique identifier)';
COMMENT ON COLUMN insta_post_clients.client_id IS 'Client ID that has access to this post';
COMMENT ON COLUMN insta_post_clients.created_at IS 'When this client-post association was created';
