import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import cronManifest from '../../src/cron/cronManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function loadFile(modulePath) {
  const absolutePath = path.resolve(repoRoot, modulePath.replace(/^\.\//, ''));
  return fs.readFileSync(absolutePath, 'utf8');
}

function extractSchedules(content) {
  const regex = /scheduleCronJob\s*\(\s*[^,]+,\s*(['"`])([^'"`]+)\1/gi;
  const schedules = [];
  let match;
  while ((match = regex.exec(content))) {
    schedules.push(match[2]);
  }

  return schedules.length ? schedules.join('<br>') : '_Not scheduled_';
}

function renderTableRow(manifestEntry) {
  const { modulePath, description } = manifestEntry;
  const fileName = path.basename(modulePath);
  const content = loadFile(modulePath);
  const schedule = extractSchedules(content);

  return `| \`${fileName}\` | \`${schedule}\` | ${description} |`;
}

function renderTable(manifest) {
  const rows = manifest.map(renderTableRow).join('\n');
  return `| File | Schedule (Asia/Jakarta) | Description |\n|------|-------------------------|-------------|\n${rows}`;
}

console.log(renderTable(cronManifest));
