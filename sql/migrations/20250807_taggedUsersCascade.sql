-- Add cascading deletes for ig_ext_tagged_users
ALTER TABLE ig_ext_tagged_users
  DROP CONSTRAINT IF EXISTS ig_ext_tagged_users_media_id_fkey,
  ADD CONSTRAINT ig_ext_tagged_users_media_id_fkey FOREIGN KEY (media_id)
    REFERENCES ig_ext_media_items(media_id) ON DELETE CASCADE;
