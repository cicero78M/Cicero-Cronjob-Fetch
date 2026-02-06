import { query } from '../repository/db.js';

export async function upsertHashtagInfo(data) {
  if (!data || !data.id || !data.name) return;
  const {
    id,
    name,
    profile_pic_url = null,
    media_count = null,
    formatted_media_count = null,
    is_trending = null,
    allow_muting_story = null,
    hide_use_hashtag_button = null,
    show_follow_drop_down = null,
    content_advisory = null,
    subtitle = null,
    warning_message = null
  } = data;
  await query(
    `INSERT INTO ig_hashtag_info (
      hashtag_id, name, profile_pic_url, media_count, formatted_media_count,
      is_trending, allow_muting_story, hide_use_hashtag_button,
      show_follow_drop_down, content_advisory, subtitle, warning_message
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    )
    ON CONFLICT (hashtag_id) DO UPDATE SET
      name=EXCLUDED.name,
      profile_pic_url=EXCLUDED.profile_pic_url,
      media_count=EXCLUDED.media_count,
      formatted_media_count=EXCLUDED.formatted_media_count,
      is_trending=EXCLUDED.is_trending,
      allow_muting_story=EXCLUDED.allow_muting_story,
      hide_use_hashtag_button=EXCLUDED.hide_use_hashtag_button,
      show_follow_drop_down=EXCLUDED.show_follow_drop_down,
      content_advisory=EXCLUDED.content_advisory,
      subtitle=EXCLUDED.subtitle,
      warning_message=EXCLUDED.warning_message`,
    [
      id,
      name,
      profile_pic_url,
      media_count,
      formatted_media_count,
      is_trending,
      allow_muting_story,
      hide_use_hashtag_button,
      show_follow_drop_down,
      content_advisory,
      subtitle,
      warning_message
    ]
  );
}
