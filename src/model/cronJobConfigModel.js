import { query } from '../repository/db.js';

export async function listCronJobs() {
  const { rows } = await query(
    `SELECT job_key, display_name, is_active, created_at, updated_at
     FROM cron_job_config
     ORDER BY job_key`,
  );
  return rows;
}

export async function getCronJob(jobKey) {
  const { rows } = await query(
    `SELECT job_key, display_name, is_active, created_at, updated_at
     FROM cron_job_config
     WHERE job_key = $1
     LIMIT 1`,
    [jobKey],
  );
  return rows[0] ?? null;
}

export async function updateCronJobStatus(jobKey, isActive) {
  const { rows } = await query(
    `UPDATE cron_job_config
     SET is_active = $2
     WHERE job_key = $1
     RETURNING job_key, display_name, is_active, created_at, updated_at`,
    [jobKey, isActive],
  );
  return rows[0] ?? null;
}
