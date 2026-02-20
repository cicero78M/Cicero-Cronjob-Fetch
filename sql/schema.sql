CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clients (
  client_id VARCHAR PRIMARY KEY,
  nama VARCHAR NOT NULL,
  client_type VARCHAR,
  client_status BOOLEAN DEFAULT TRUE,
  client_insta VARCHAR,
  client_insta_status BOOLEAN DEFAULT TRUE,
  client_tiktok VARCHAR,
  client_tiktok_status BOOLEAN DEFAULT TRUE,
  client_amplify_status BOOLEAN DEFAULT TRUE,
  client_operator VARCHAR,
  client_group VARCHAR,
  regional_id VARCHAR,
  parent_client_id VARCHAR REFERENCES clients(client_id),
  client_level VARCHAR,
  tiktok_secuid VARCHAR,
  client_super VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_clients_regional_id ON clients (regional_id);
CREATE INDEX IF NOT EXISTS idx_clients_parent_client_id ON clients (parent_client_id);

CREATE TABLE satbinmas_official_accounts (
  satbinmas_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  platform VARCHAR NOT NULL,
  username VARCHAR NOT NULL,
  secuid TEXT,
  display_name TEXT,
  profile_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (client_id, platform)
);

CREATE TABLE "user" (
  user_id VARCHAR PRIMARY KEY,
  nama VARCHAR,
  title VARCHAR,
  divisi VARCHAR,
  jabatan VARCHAR,
  insta VARCHAR,
  tiktok VARCHAR,
  whatsapp VARCHAR,
  email VARCHAR,
  desa VARCHAR,
  client_id VARCHAR REFERENCES clients(client_id),
  status BOOLEAN DEFAULT TRUE,
  exception BOOLEAN DEFAULT FALSE,
  wa_notification_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  premium_status BOOLEAN DEFAULT FALSE,
  premium_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR UNIQUE
);

CREATE TABLE user_roles (
  user_id VARCHAR REFERENCES "user"(user_id),
  role_id INTEGER REFERENCES roles(role_id),
  PRIMARY KEY (user_id, role_id)
);

CREATE OR REPLACE FUNCTION set_user_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_set_updated_at ON "user";
CREATE TRIGGER user_set_updated_at
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE PROCEDURE set_user_updated_at();

CREATE TABLE penmas_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dashboard_user (
  dashboard_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(role_id),
  status BOOLEAN DEFAULT TRUE,
  whatsapp VARCHAR,
  premium_status BOOLEAN DEFAULT FALSE,
  premium_tier TEXT,
  premium_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dashboard_user_clients (
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  client_id VARCHAR REFERENCES clients(client_id),
  PRIMARY KEY (dashboard_user_id, client_id)
);

CREATE TABLE dashboard_user_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_user_id UUID NOT NULL REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  canceled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_subscriptions_user_status_expires ON dashboard_user_subscriptions (dashboard_user_id, status, expires_at);

CREATE TABLE dashboard_premium_request (
  request_id SERIAL PRIMARY KEY,
  request_token UUID NOT NULL DEFAULT gen_random_uuid(),
  dashboard_user_id UUID NOT NULL REFERENCES dashboard_user(dashboard_user_id) ON DELETE CASCADE,
  client_id VARCHAR REFERENCES clients(client_id),
  username TEXT NOT NULL,
  whatsapp TEXT,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  transfer_amount NUMERIC,
  premium_tier TEXT,
  proof_url TEXT,
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expired_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  admin_whatsapp TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_premium_request_token
  ON dashboard_premium_request (request_token);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_status_expired
  ON dashboard_premium_request (status, expired_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_user_status
  ON dashboard_premium_request (dashboard_user_id, status);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_client
  ON dashboard_premium_request (client_id);

CREATE TABLE dashboard_premium_request_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES dashboard_premium_request(request_id) ON DELETE CASCADE,
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  status_from TEXT,
  status_to TEXT,
  admin_whatsapp TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_audit_request
  ON dashboard_premium_request_audit (request_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_premium_request_audit_action
  ON dashboard_premium_request_audit (action);

CREATE OR REPLACE FUNCTION set_dashboard_premium_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_premium_request_set_updated_at ON dashboard_premium_request;
CREATE TRIGGER dashboard_premium_request_set_updated_at
BEFORE UPDATE ON dashboard_premium_request
FOR EACH ROW
EXECUTE PROCEDURE set_dashboard_premium_request_updated_at();

CREATE OR REPLACE FUNCTION set_dashboard_premium_request_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_premium_request_audit_set_updated_at ON dashboard_premium_request_audit;
CREATE TRIGGER dashboard_premium_request_audit_set_updated_at
BEFORE UPDATE ON dashboard_premium_request_audit
FOR EACH ROW
EXECUTE PROCEDURE set_dashboard_premium_request_audit_updated_at();

CREATE TABLE insta_post (
  shortcode VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  comment_count INT,
  thumbnail_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  image_url TEXT,
  images_url JSONB,
  is_carousel BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);

CREATE TABLE insta_post_clients (
  shortcode VARCHAR NOT NULL REFERENCES insta_post(shortcode) ON DELETE CASCADE,
  client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (shortcode, client_id)
);

CREATE INDEX idx_insta_post_clients_client_id ON insta_post_clients(client_id);
CREATE INDEX idx_insta_post_clients_shortcode ON insta_post_clients(shortcode);

CREATE TABLE insta_post_roles (
  shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
  role_name VARCHAR NOT NULL,
  PRIMARY KEY (shortcode, role_name)
);

CREATE TABLE insta_like (
  shortcode VARCHAR PRIMARY KEY REFERENCES insta_post(shortcode),
  likes JSONB,
  updated_at TIMESTAMP
);

CREATE TABLE insta_like_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  shortcode VARCHAR REFERENCES insta_post(shortcode),
  usernames JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_window_start TIMESTAMPTZ NOT NULL,
  snapshot_window_end TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insta_like_audit_shortcode ON insta_like_audit (shortcode);
CREATE INDEX idx_insta_like_audit_window ON insta_like_audit (shortcode, snapshot_window_start, snapshot_window_end);

CREATE TABLE insta_comment (
  shortcode VARCHAR PRIMARY KEY REFERENCES insta_post(shortcode),
  comments JSONB,
  updated_at TIMESTAMP
);

CREATE TABLE insta_post_khusus (
  shortcode VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  comment_count INT,
  thumbnail_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  image_url TEXT,
  images_url JSONB,
  is_carousel BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);

CREATE TABLE insta_profile (
  username VARCHAR PRIMARY KEY,
  full_name VARCHAR,
  biography TEXT,
  follower_count INT,
  following_count INT,
  post_count INT,
  profile_pic_url TEXT,
  updated_at TIMESTAMP
);

CREATE TABLE tiktok_post (
  video_id VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  like_count INT,
  comment_count INT,
  created_at TIMESTAMP WITH TIME ZONE,
  source_type TEXT NOT NULL DEFAULT 'cron_fetch'
);

CREATE TABLE tiktok_comment (
  video_id VARCHAR PRIMARY KEY REFERENCES tiktok_post(video_id) ON DELETE CASCADE,
  comments JSONB,
  updated_at TIMESTAMP
);

CREATE TABLE tiktok_comment_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  video_id VARCHAR REFERENCES tiktok_post(video_id) ON DELETE CASCADE,
  usernames JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_window_start TIMESTAMPTZ NOT NULL,
  snapshot_window_end TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiktok_comment_audit_video ON tiktok_comment_audit (video_id);
CREATE INDEX idx_tiktok_comment_audit_window ON tiktok_comment_audit (video_id, snapshot_window_start, snapshot_window_end);

CREATE TABLE tiktok_post_roles (
  video_id VARCHAR REFERENCES tiktok_post(video_id) ON DELETE CASCADE,
  role_name VARCHAR NOT NULL,
  PRIMARY KEY (video_id, role_name)
);


-- Instagram data tables
-- Tabel utama dengan informasi profil dasar
CREATE TABLE instagram_user (
    user_id                 VARCHAR(30) PRIMARY KEY,
    username                VARCHAR(100) UNIQUE NOT NULL,
    full_name               VARCHAR(100),
    biography               TEXT,
    business_contact_method VARCHAR(50),
    category                VARCHAR(100),
    category_id             BIGINT,
    account_type            SMALLINT,
    contact_phone_number    VARCHAR(30),
    external_url            TEXT,
    fbid_v2                 VARCHAR(40),
    is_business             BOOLEAN,
    is_private              BOOLEAN,
    is_verified             BOOLEAN,
    public_email            VARCHAR(100),
    public_phone_country_code VARCHAR(10),
    public_phone_number     VARCHAR(30),
    profile_pic_url         TEXT,
    profile_pic_url_hd      TEXT
);

-- Statistik/metric akun
CREATE TABLE instagram_user_metrics (
    user_id                 VARCHAR(30) PRIMARY KEY REFERENCES instagram_user(user_id),
    follower_count          INT,
    following_count         INT,
    media_count             INT,
    total_igtv_videos       INT,
    latest_reel_media       BIGINT
);

-- Extended tables for storing detailed Instagram data fetched from RapidAPI
CREATE TABLE IF NOT EXISTS ig_ext_users (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    full_name VARCHAR(100),
    is_private BOOLEAN,
    is_verified BOOLEAN,
    profile_pic_url TEXT
);

CREATE TABLE IF NOT EXISTS ig_ext_posts (
    post_id VARCHAR(50) PRIMARY KEY,
    shortcode VARCHAR(50) UNIQUE REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    caption_text TEXT,
    created_at TIMESTAMP,
    like_count INT,
    comment_count INT,
    is_video BOOLEAN,
    media_type INT,
    is_pinned BOOLEAN
);

CREATE TABLE IF NOT EXISTS ig_ext_media_items (
    media_id VARCHAR(50) PRIMARY KEY,
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    media_type INT,
    is_video BOOLEAN,
    original_width INT,
    original_height INT,
    image_url TEXT,
    video_url TEXT,
    video_duration REAL,
    thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS ig_ext_tagged_users (
    media_id VARCHAR(50) REFERENCES ig_ext_media_items(media_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    x REAL,
    y REAL,
    PRIMARY KEY (media_id, user_id)
);

CREATE TABLE IF NOT EXISTS ig_ext_hashtags (
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    hashtag VARCHAR(100),
    PRIMARY KEY (post_id, hashtag)
);

-- Informasi detail hashtag dari endpoint RapidAPI
CREATE TABLE IF NOT EXISTS ig_hashtag_info (
    hashtag_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    profile_pic_url TEXT,
    media_count INT,
    formatted_media_count VARCHAR(20),
    is_trending BOOLEAN,
    allow_muting_story BOOLEAN,
    hide_use_hashtag_button BOOLEAN,
    show_follow_drop_down BOOLEAN,
    content_advisory TEXT,
    subtitle TEXT,
    warning_message TEXT
);

-- Statistik lanjutan untuk setiap post
CREATE TABLE IF NOT EXISTS ig_post_metrics (
    post_id VARCHAR(50) PRIMARY KEY REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    play_count INT,
    save_count INT,
    share_count INT,
    view_count INT,
    fb_like_count INT,
    fb_play_count INT
);

-- Relational table for individual likes
CREATE TABLE IF NOT EXISTS ig_post_like_users (
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    username VARCHAR(100),
    PRIMARY KEY (post_id, user_id)
);

-- Store individual comments for a post
CREATE TABLE IF NOT EXISTS ig_post_comments (
    comment_id VARCHAR(50) PRIMARY KEY,
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    text TEXT,
    created_at TIMESTAMP
);

CREATE TABLE visitor_logs (
    id SERIAL PRIMARY KEY,
    ip VARCHAR,
    user_agent TEXT,
    visited_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES "user"(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_shortcode_user_idx
    ON tasks (shortcode, user_id, created_at);

CREATE TABLE IF NOT EXISTS link_report (
    shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES "user"(user_id),
    instagram_link TEXT,
    facebook_link TEXT,
    twitter_link TEXT,
    tiktok_link TEXT,
    youtube_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (shortcode, user_id)
);

CREATE TABLE IF NOT EXISTS link_report_khusus (
    shortcode VARCHAR REFERENCES insta_post_khusus(shortcode),
    user_id VARCHAR REFERENCES "user"(user_id),
    instagram_link TEXT,
    facebook_link TEXT,
    twitter_link TEXT,
    tiktok_link TEXT,
    youtube_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (shortcode, user_id)
);


CREATE TABLE IF NOT EXISTS editorial_event (
  event_id SERIAL PRIMARY KEY,
  event_date TIMESTAMP NOT NULL,
  topic TEXT NOT NULL,
  judul_berita TEXT,
  assignee VARCHAR(50),
  status VARCHAR(20) DEFAULT 'draft',
  content TEXT,
  summary TEXT,
  image_path TEXT,
  tag TEXT,
  kategori TEXT,
  created_by TEXT REFERENCES penmas_user(user_id),
  updated_by TEXT REFERENCES penmas_user(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_update TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS press_release_detail (
  event_id INTEGER PRIMARY KEY REFERENCES editorial_event(event_id),
  judul TEXT,
  dasar TEXT,
  tersangka TEXT,
  tkp TEXT,
  kronologi TEXT,
  modus TEXT,
  barang_bukti TEXT,
  pasal TEXT,
  ancaman TEXT,
  catatan TEXT
);

CREATE TABLE IF NOT EXISTS approval_request (
  request_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  requested_by TEXT REFERENCES penmas_user(user_id),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS premium_request (
  request_id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES "user"(user_id),
  sender_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  screenshot_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_log (
  log_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  user_id TEXT REFERENCES penmas_user(user_id),
  status VARCHAR(20),
  changes TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS login_log (
  log_id SERIAL PRIMARY KEY,
  actor_id TEXT,
  login_type VARCHAR(20),
  login_source VARCHAR(20),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_contact (
  phone_number VARCHAR PRIMARY KEY,
  resource_name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_notification_reminder_state (
  reminder_state_id SERIAL PRIMARY KEY,
  date_key DATE NOT NULL,
  chat_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  last_stage VARCHAR(20) NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (date_key, chat_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_notification_reminder_state_date_chat_client
  ON wa_notification_reminder_state (date_key, chat_id, client_id);

CREATE INDEX IF NOT EXISTS idx_wa_notification_reminder_state_date_status
  ON wa_notification_reminder_state (date_key, is_complete, last_stage);

CREATE OR REPLACE FUNCTION set_wa_notification_reminder_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_notification_reminder_state_set_updated_at ON wa_notification_reminder_state;
CREATE TRIGGER wa_notification_reminder_state_set_updated_at
BEFORE UPDATE ON wa_notification_reminder_state
FOR EACH ROW
EXECUTE PROCEDURE set_wa_notification_reminder_state_updated_at();

CREATE TABLE IF NOT EXISTS wa_notification_outbox (
  outbox_id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  message TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_notification_outbox_dispatch
  ON wa_notification_outbox (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_wa_notification_outbox_client
  ON wa_notification_outbox (client_id, status);

CREATE OR REPLACE FUNCTION set_wa_notification_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_notification_outbox_set_updated_at ON wa_notification_outbox;
CREATE TRIGGER wa_notification_outbox_set_updated_at
BEFORE UPDATE ON wa_notification_outbox
FOR EACH ROW
EXECUTE PROCEDURE set_wa_notification_outbox_updated_at();

CREATE TABLE IF NOT EXISTS cron_job_config (
  job_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_cron_job_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cron_job_config_set_updated_at ON cron_job_config;
CREATE TRIGGER cron_job_config_set_updated_at
BEFORE UPDATE ON cron_job_config
FOR EACH ROW
EXECUTE PROCEDURE set_cron_job_config_updated_at();

INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronDbBackup.js', 'Database Backup'),
    ('./src/cron/cronRekapLink.js', 'Link Recap Dispatcher'),
    ('./src/cron/cronAmplifyLinkMonthly.js', 'Monthly Amplify Link'),
    ('./src/cron/cronDirRequestRekapUpdate.js', 'Directorate Rekap Update'),
    ('./src/cron/cronDirRequestFetchSosmed.js', 'Directorate Fetch Sosmed'),
    ('./src/cron/cronWaNotificationReminder.js', 'Ditbinmas Task Reminder'),
    ('./src/cron/cronDirRequestSatbinmasOfficialMedia.js', 'Satbinmas Official Media Recap'),
    ('./src/cron/cronDirRequestBidhumasEvening.js', 'Bidhumas Evening Menu 6 & 9'),
    ('./src/cron/cronOprRequestAbsensiEngagement.js', 'Oprrequest Engagement Absensi'),
    ('./src/cron/cronWaOutboxWorker.js', 'WhatsApp Notification Outbox Worker')
ON CONFLICT (job_key) DO NOTHING;

-- No additional setup steps required beyond applying this schema.
