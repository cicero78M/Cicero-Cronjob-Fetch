-- Ensure link_report entries are removed when the referenced post is deleted
ALTER TABLE link_report
  DROP CONSTRAINT IF EXISTS link_report_shortcode_fkey,
  ADD CONSTRAINT link_report_shortcode_fkey FOREIGN KEY (shortcode)
    REFERENCES insta_post(shortcode) ON DELETE CASCADE;

