-- Seed cron job config for Ditbinmas operator daily report
INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronDirRequestDitbinmasOperatorDaily.js', 'Ditbinmas Operator Daily Menu 30')
ON CONFLICT (job_key) DO NOTHING;
