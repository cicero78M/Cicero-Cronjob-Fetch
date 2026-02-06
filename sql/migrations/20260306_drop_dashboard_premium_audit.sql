-- Drop dashboard_premium_audit and related trigger helper
DROP TRIGGER IF EXISTS dashboard_premium_audit_set_updated_at ON dashboard_premium_audit;
DROP FUNCTION IF EXISTS set_dashboard_premium_audit_updated_at();
DROP TABLE IF EXISTS dashboard_premium_audit;
