-- Add email column to user table
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS email VARCHAR;
