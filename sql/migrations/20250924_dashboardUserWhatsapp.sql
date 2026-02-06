-- Add whatsapp column to dashboard_user
ALTER TABLE dashboard_user
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR;
