-- Create mapping table between TikTok posts and roles
CREATE TABLE IF NOT EXISTS tiktok_post_roles (
  video_id VARCHAR REFERENCES tiktok_post(video_id) ON DELETE CASCADE,
  role_name VARCHAR NOT NULL,
  PRIMARY KEY (video_id, role_name)
);
