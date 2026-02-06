ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE "user"
SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

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
