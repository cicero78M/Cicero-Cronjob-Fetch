import { getClientContactsById } from '../repository/clientContactRepository.js';
import { formatToWhatsAppId, getAdminWAIds } from './waHelper.js';

function normalizeRecipient(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@c.us') || trimmed.endsWith('@g.us')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  try {
    return formatToWhatsAppId(digits);
  } catch (error) {
    console.warn('[recipientHelper] Failed to normalize recipient', { value, error });
    return null;
  }
}

function addRecipients(targetSet, candidates = []) {
  candidates
    .map((candidate) => normalizeRecipient(candidate))
    .filter(Boolean)
    .forEach((recipient) => targetSet.add(recipient));
}

export async function buildClientRecipientSet(
  clientId,
  { includeGroup = true, includeAdmins = true, includeSuper = true, includeOperator = true } = {}
) {
  const recipients = new Set();
  const contacts = await getClientContactsById(clientId);

  if (includeAdmins) {
    addRecipients(recipients, getAdminWAIds());
  }

  if (includeSuper) {
    addRecipients(recipients, contacts.clientSuper);
  }
  if (includeOperator) {
    addRecipients(recipients, contacts.clientOperator);
  }
  if (includeGroup) {
    addRecipients(recipients, contacts.clientGroup);
  }

  const hasClientRecipients = Boolean(
    (includeSuper && contacts.clientSuper.length) ||
      (includeOperator && contacts.clientOperator.length) ||
      (includeGroup && contacts.clientGroup.length)
  );

  return { recipients, hasClientRecipients };
}

export { normalizeRecipient, addRecipients };
