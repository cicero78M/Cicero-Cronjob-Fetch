import { scheduleCronJob } from '../utils/cronScheduler.js';
import dotenv from 'dotenv';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import { env } from '../config/env.js';

dotenv.config();

function parseServiceAccount(data) {
  if (!data) throw new Error('GOOGLE_SERVICE_ACCOUNT not set');
  if (data.trim().startsWith('{')) {
    return JSON.parse(data);
  }
  const filePath = path.resolve(data);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCommand(cmd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { env: { ...process.env, ...extraEnv } }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

async function uploadToDrive(filePath) {
  const credentials = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  const drive = google.drive({ version: 'v3', auth });
  await drive.files.create({
    requestBody: {
      name: path.basename(filePath),
      parents: env.GOOGLE_DRIVE_FOLDER_ID ? [env.GOOGLE_DRIVE_FOLDER_ID] : undefined
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath)
    },
    fields: 'id'
  });
}

async function backupDatabase() {
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = env.BACKUP_DIR;
  await fsPromises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${env.DB_NAME}-${date}.sql`);
  const driver = (env.DB_DRIVER || '').toLowerCase();
  let cmd;
  if (driver === 'mysql') {
    cmd = `mysqldump -u ${env.DB_USER} -p${env.DB_PASS} -h ${env.DB_HOST} -P ${env.DB_PORT} ${env.DB_NAME} > ${filePath}`;
  } else if (driver === 'sqlite') {
    cmd = `sqlite3 ${env.DB_NAME} .dump > ${filePath}`;
  } else {
    cmd = `pg_dump -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_USER} ${env.DB_NAME} > ${filePath}`;
  }
  await runCommand(cmd, { PGPASSWORD: env.DB_PASS });
  await uploadToDrive(filePath);
  await fsPromises.unlink(filePath);
}

const JOB_KEY = './src/cron/cronDbBackup.js';

scheduleCronJob(
  JOB_KEY,
  '0 4 * * *',
  () => {
    backupDatabase().catch((err) => {
      console.error('[DB BACKUP] failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;