-- Enforce unique usernames per platform across all clients
-- Remove duplicates by keeping the most recently updated row per platform/username pair
WITH ranked_accounts AS (
    SELECT ctid,
           ROW_NUMBER() OVER (
               PARTITION BY platform, LOWER(username)
               ORDER BY updated_at DESC, created_at DESC, satbinmas_account_id DESC
           ) AS row_num
    FROM satbinmas_official_accounts
)
DELETE FROM satbinmas_official_accounts s
USING ranked_accounts r
WHERE s.ctid = r.ctid
  AND r.row_num > 1;

-- Add a unique index that enforces case-insensitive username uniqueness per platform
CREATE UNIQUE INDEX IF NOT EXISTS satbinmas_official_accounts_platform_username_unique
    ON satbinmas_official_accounts (platform, LOWER(username));
