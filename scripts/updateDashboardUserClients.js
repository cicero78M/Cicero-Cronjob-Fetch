import * as dashboardUserModel from '../src/model/dashboardUserModel.js';
import { query } from '../src/repository/db.js';
import { close } from '../src/db/index.js';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function normalizeClientId(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseClientIds(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw
    .map(normalizeClientId)
    .filter(Boolean);
}

function buildUsage() {
  return `Usage: node scripts/updateDashboardUserClients.js \
  --dashboard-user-id <uuid> | --username <name> | --whatsapp <number> \
  --client-ids <clientA,clientB>

Example:
  node scripts/updateDashboardUserClients.js --username operator1 --client-ids JOMBANG
`;
}

async function fetchDashboardUser(options) {
  if (options['dashboard-user-id']) {
    return dashboardUserModel.findById(options['dashboard-user-id']);
  }
  if (options.username) {
    return dashboardUserModel.findByUsername(options.username);
  }
  if (options.whatsapp) {
    return dashboardUserModel.findByWhatsApp(options.whatsapp);
  }
  return null;
}

async function validateClientIds(clientIds) {
  const { rows } = await query(
    'SELECT client_id FROM clients WHERE client_id = ANY($1)',
    [clientIds],
  );
  const existing = new Set(rows.map(row => row.client_id));
  const missing = clientIds.filter(clientId => !existing.has(clientId));
  return { existing, missing };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(buildUsage());
    return;
  }

  const targetIdentifiers = ['dashboard-user-id', 'username', 'whatsapp'];
  const hasTarget = targetIdentifiers.some(key => Boolean(options[key]));
  const clientIds = parseClientIds(options['client-ids'] || options.clientIds);

  if (!hasTarget || clientIds.length === 0) {
    console.error('Missing required arguments.');
    console.error(buildUsage());
    process.exitCode = 1;
    return;
  }

  const dashboardUser = await fetchDashboardUser(options);
  if (!dashboardUser) {
    console.error('Dashboard user not found.');
    process.exitCode = 1;
    return;
  }

  const normalizedExisting = (dashboardUser.client_ids || [])
    .map(normalizeClientId)
    .filter(Boolean);
  const existingSet = new Set(normalizedExisting.map(id => id.toLowerCase()));
  const requested = clientIds.filter(id => !existingSet.has(id.toLowerCase()));

  if (requested.length === 0) {
    console.log('No new client_ids to add.');
    return;
  }

  const { missing } = await validateClientIds(requested);
  if (missing.length > 0) {
    console.error(`Client ID not found: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  await dashboardUserModel.addClients(dashboardUser.dashboard_user_id, requested);
  const refreshed = await dashboardUserModel.findById(dashboardUser.dashboard_user_id);
  const updatedIds = refreshed?.client_ids || [];
  console.log(`Updated client_ids for ${dashboardUser.username || dashboardUser.dashboard_user_id}:`);
  console.log(updatedIds.join(', '));
}

try {
  await run();
} finally {
  await close();
}
