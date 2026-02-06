// Backward-compatible wrapper that delegates Satbinmas TikTok media fetches
// to the snapshot-based implementation.
import { fetchTodaySatbinmasOfficialTiktokMediaForOrgClients as fetchOrgClients } from "./satbinmasOfficialTiktokService.js";
import { findAllOrgClients } from "../model/clientModel.js";
import { findActiveByClientAndPlatform } from "../model/satbinmasOfficialAccountModel.js";
import { summarizeSatbinmasTiktokPostsBySecuids } from "../model/tiktokSnapshotModel.js";

function resolveDefaultRange(start, end) {
  if (start && end) return { start, end };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: start || today, end: end || tomorrow };
}

/**
 * Fetch today's Satbinmas Official TikTok media for a single client.
 * Delegates to the ORG-wide fetcher and filters the response.
 * @param {string} clientId
 * @param {number} delayMs
 * @returns {Promise<object>}
 */
export async function fetchTodaySatbinmasOfficialTiktokMedia(clientId, delayMs) {
  const summary = await fetchOrgClients(delayMs);
  const normalized = String(clientId || "").trim().toLowerCase();
  const clientSummary = summary.clients.find(
    (item) => String(item.clientId || "").trim().toLowerCase() === normalized
  );

  return (
    clientSummary || {
      clientId,
      name: null,
      accounts: [],
      errors: [],
    }
  );
}

export const fetchTodaySatbinmasOfficialTiktokMediaForOrgClients = fetchOrgClients;

export async function fetchSatbinmasOfficialTiktokMediaFromDb({ start, end } = {}) {
  const { start: rangeStart, end: rangeEnd } = resolveDefaultRange(start, end);
  const clients = await findAllOrgClients();

  const summary = { clients: [], totals: { clients: clients.length, accounts: 0, fetched: 0 } };

  for (const client of clients) {
    const accounts = await findActiveByClientAndPlatform(client.client_id, "tiktok");
    const usableAccounts = accounts.filter((acc) => acc.secUid?.trim());
    const clientSummary = { clientId: client.client_id, name: client.nama, accounts: [], errors: [] };

    if (usableAccounts.length) {
      const statsMap = await summarizeSatbinmasTiktokPostsBySecuids(
        usableAccounts.map((acc) => acc.secUid),
        rangeStart,
        rangeEnd
      );

      usableAccounts.forEach((account) => {
        const stats = statsMap.get(account.secUid) || { total: 0, likes: 0, comments: 0 };
        summary.totals.accounts += 1;
        summary.totals.fetched += stats.total;
        clientSummary.accounts.push({
          username: account.username,
          total: stats.total,
          inserted: 0,
          updated: 0,
          removed: 0,
          likes: stats.likes,
          comments: stats.comments,
        });
      });
    }

    const missingSecUidAccounts = accounts.filter((acc) => !acc.secUid?.trim());
    missingSecUidAccounts.forEach((account) => {
      clientSummary.errors.push({
        username: account.username,
        message: "secUid TikTok belum tersinkron.",
      });
      summary.totals.accounts += 1;
    });

    summary.clients.push(clientSummary);
  }

  return summary;
}
