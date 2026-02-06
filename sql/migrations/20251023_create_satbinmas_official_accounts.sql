-- Create table to store official Satbinmas accounts linked to clients
CREATE TABLE IF NOT EXISTS satbinmas_official_accounts (
    satbinmas_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    username TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT satbinmas_official_accounts_client_platform_unique UNIQUE (client_id, platform)
);

CREATE OR REPLACE FUNCTION set_satbinmas_official_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS satbinmas_official_accounts_set_updated_at ON satbinmas_official_accounts;
CREATE TRIGGER satbinmas_official_accounts_set_updated_at
BEFORE UPDATE ON satbinmas_official_accounts
FOR EACH ROW
EXECUTE PROCEDURE set_satbinmas_official_accounts_updated_at();
