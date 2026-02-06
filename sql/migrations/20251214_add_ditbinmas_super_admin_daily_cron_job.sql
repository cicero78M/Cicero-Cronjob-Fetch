-- Seed cron job config for Ditbinmas super admin daily recap
INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronDirRequestDitbinmasSuperAdminDaily.js', 'Ditbinmas Super Admin Daily Menu 6/9/34/35')
ON CONFLICT (job_key) DO NOTHING;
