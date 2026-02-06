import * as cronJobConfigModel from '../model/cronJobConfigModel.js';

export function listCronJobs() {
  return cronJobConfigModel.listCronJobs();
}

export function list() {
  return listCronJobs();
}

export function getCronJob(jobKey) {
  return cronJobConfigModel.getCronJob(jobKey);
}

export async function updateCronJobStatus(jobKey, isActive) {
  if (typeof isActive !== 'boolean') {
    throw new TypeError('isActive must be a boolean value');
  }
  const updated = await cronJobConfigModel.updateCronJobStatus(jobKey, isActive);
  if (!updated) {
    const error = new Error(`Cron job with key ${jobKey} was not found`);
    error.code = 'CRON_JOB_NOT_FOUND';
    throw error;
  }
  return updated;
}
