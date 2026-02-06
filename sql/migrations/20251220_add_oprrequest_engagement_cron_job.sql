-- Seed cron job config for oprrequest engagement absensi (Instagram & TikTok)
INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronOprRequestAbsensiEngagement.js', 'Oprrequest Engagement Absensi')
ON CONFLICT (job_key) DO NOTHING;
