-- Seed cron job config for BIDHUMAS evening dirRequest sequence
INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronDirRequestBidhumasEvening.js', 'Bidhumas Evening Menu 6 & 9')
ON CONFLICT (job_key) DO NOTHING;
