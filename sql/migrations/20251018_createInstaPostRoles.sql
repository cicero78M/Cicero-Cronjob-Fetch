-- Create mapping table between Instagram posts and roles
CREATE TABLE IF NOT EXISTS insta_post_roles (
  shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
  role_name VARCHAR NOT NULL,
  PRIMARY KEY (shortcode, role_name)
);
