-- Rename TikTok snapshot tables to satbinmas-specific names while preserving data
-- and create them if they do not exist (e.g., fresh installs skipping prior names).

DO $$
BEGIN
    -- satbinmas_tiktok_accounts
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tiktok_accounts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_accounts'
    ) THEN
        EXECUTE 'ALTER TABLE tiktok_accounts RENAME TO satbinmas_tiktok_accounts';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_accounts'
    ) THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS satbinmas_tiktok_accounts (
            author_secuid TEXT PRIMARY KEY,
            author_id TEXT,
            username TEXT NOT NULL,
            display_name TEXT,
            bio TEXT,
            avatar_url TEXT,
            is_verified BOOLEAN DEFAULT FALSE,
            is_private BOOLEAN DEFAULT FALSE,
            followers BIGINT,
            following BIGINT,
            likes_total BIGINT,
            video_count BIGINT,
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tiktok_accounts_username_unique'
    ) THEN
        EXECUTE 'ALTER INDEX tiktok_accounts_username_unique RENAME TO satbinmas_tiktok_accounts_username_unique';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'satbinmas_tiktok_accounts_username_unique'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX satbinmas_tiktok_accounts_username_unique
            ON satbinmas_tiktok_accounts (LOWER(username))';
    END IF;

    -- satbinmas_tiktok_posts
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tiktok_posts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_posts'
    ) THEN
        EXECUTE 'ALTER TABLE tiktok_posts RENAME TO satbinmas_tiktok_posts';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_posts'
    ) THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS satbinmas_tiktok_posts (
            post_id TEXT PRIMARY KEY,
            author_secuid TEXT NOT NULL REFERENCES satbinmas_tiktok_accounts(author_secuid) ON DELETE CASCADE,
            caption TEXT,
            created_at TIMESTAMPTZ,
            language TEXT,
            play_url TEXT,
            cover_url TEXT,
            duration_sec INTEGER,
            height INTEGER,
            width INTEGER,
            ratio TEXT,
            views BIGINT,
            likes BIGINT,
            comments BIGINT,
            shares BIGINT,
            bookmarks BIGINT,
            is_ad BOOLEAN DEFAULT FALSE,
            is_private_post BOOLEAN DEFAULT FALSE,
            share_enabled BOOLEAN DEFAULT TRUE,
            duet_enabled BOOLEAN DEFAULT TRUE,
            stitch_enabled BOOLEAN DEFAULT TRUE,
            crawl_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tiktok_posts_author_idx'
    ) THEN
        EXECUTE 'ALTER INDEX tiktok_posts_author_idx RENAME TO satbinmas_tiktok_posts_author_idx';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tiktok_posts_created_idx'
    ) THEN
        EXECUTE 'ALTER INDEX tiktok_posts_created_idx RENAME TO satbinmas_tiktok_posts_created_idx';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'satbinmas_tiktok_posts_author_idx'
    ) THEN
        EXECUTE 'CREATE INDEX satbinmas_tiktok_posts_author_idx
            ON satbinmas_tiktok_posts (author_secuid)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'satbinmas_tiktok_posts_created_idx'
    ) THEN
        EXECUTE 'CREATE INDEX satbinmas_tiktok_posts_created_idx
            ON satbinmas_tiktok_posts (created_at)';
    END IF;

    -- satbinmas_tiktok_post_hashtags
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tiktok_post_hashtags'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_post_hashtags'
    ) THEN
        EXECUTE 'ALTER TABLE tiktok_post_hashtags RENAME TO satbinmas_tiktok_post_hashtags';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'satbinmas_tiktok_post_hashtags'
    ) THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS satbinmas_tiktok_post_hashtags (
            post_id TEXT NOT NULL REFERENCES satbinmas_tiktok_posts(post_id) ON DELETE CASCADE,
            hashtag TEXT NOT NULL,
            CONSTRAINT satbinmas_tiktok_post_hashtags_pkey PRIMARY KEY (post_id, hashtag)
        )';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tiktok_post_hashtags_lower_unique'
    ) THEN
        EXECUTE 'ALTER INDEX tiktok_post_hashtags_lower_unique RENAME TO satbinmas_tiktok_post_hashtags_lower_unique';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'satbinmas_tiktok_post_hashtags_lower_unique'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX satbinmas_tiktok_post_hashtags_lower_unique
            ON satbinmas_tiktok_post_hashtags (post_id, LOWER(hashtag))';
    END IF;
END$$;
