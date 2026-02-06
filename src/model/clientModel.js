// src/model/clientModel.js

import { query } from '../repository/db.js';

let parentClientIdColumnSupported;

async function hasParentClientIdColumn() {
  if (parentClientIdColumnSupported !== undefined) {
    return parentClientIdColumnSupported;
  }
  const res = await query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'parent_client_id'"
  );
  parentClientIdColumnSupported = res.rowCount > 0;
  return parentClientIdColumnSupported;
}

async function buildClientSelect(columns, { includeParentClientId = false } = {}) {
  const selectColumns = [...columns];
  if (includeParentClientId) {
    const hasParent = await hasParentClientIdColumn();
    selectColumns.push(
      hasParent ? "parent_client_id" : "NULL::varchar AS parent_client_id"
    );
  }
  return selectColumns.join(", ");
}

// Ambil semua client
export const findAll = async () => {
  const res = await query('SELECT * FROM clients');
  return res.rows;
};

// Ambil semua client dengan status aktif
export const findAllActive = async () => {
  const res = await query('SELECT * FROM clients WHERE client_status = true');
  return res.rows;
};

export const findAllActiveOrgClients = async () => {
  const selectColumns = await buildClientSelect([
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_group",
  ]);
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND LOWER(client_type) = LOWER('org')
     ORDER BY client_id`
  );
  return res.rows;
};

export const findAllActiveOrgClientsWithSosmed = async () => {
  const selectColumns = await buildClientSelect([
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_group",
    "client_insta_status",
    "client_tiktok_status",
  ]);
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND LOWER(client_type) = LOWER('org')
       AND client_insta_status = true
       AND client_tiktok_status = true
     ORDER BY client_id`
  );
  return res.rows;
};

export const findAllActiveOrgAmplifyClients = async () => {
  const selectColumns = await buildClientSelect([
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_amplify_status",
    "client_insta",
    "client_operator",
  ]);
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND client_amplify_status = true
       AND LOWER(client_type) = LOWER('org')
     ORDER BY client_id`
  );
  return res.rows;
};

// Ambil semua client Direktorat yang aktif
export const findAllActiveDirektorat = async () => {
  const selectColumns = await buildClientSelect(
    ["client_id", "nama", "client_type", "client_status", "regional_id", "client_level"],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true AND LOWER(client_type) = LOWER('direktorat')
     ORDER BY client_id`
  );
  return res.rows;
};

export const findAllActiveDirektoratWithSosmed = async () => {
  const selectColumns = await buildClientSelect(
    [
      "client_id",
      "nama",
      "client_group",
      "client_operator",
      "client_super",
      "regional_id",
      "client_level",
    ],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND LOWER(client_type) = LOWER('direktorat')
       AND client_insta_status = true
       AND client_tiktok_status = true
     ORDER BY client_id`
  );
  return res.rows;
};

export const findAllActiveDirektoratWithTiktok = async () => {
  const selectColumns = await buildClientSelect(
    [
      "client_id",
      "nama",
      "client_group",
      "client_operator",
      "client_super",
      "client_insta_status",
      "client_tiktok_status",
      "regional_id",
      "client_level",
    ],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND LOWER(client_type) = LOWER('direktorat')
       AND client_insta_status = true
       AND client_tiktok_status = true
     ORDER BY client_id`
  );
  return res.rows;
};

export const findAllActiveClientsWithSosmed = async () => {
  const selectColumns = await buildClientSelect(
    [
      "client_id",
      "nama",
      "client_type",
      "client_status",
      "client_group",
      "client_operator",
      "client_super",
      "client_insta_status",
      "client_tiktok_status",
      "regional_id",
      "client_level",
    ],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE client_status = true
       AND (client_insta_status = true OR client_tiktok_status = true)
     ORDER BY client_id`
  );
  return res.rows;
};

// Ambil semua client berdasarkan tipe
export const findAllByType = async (clientType) => {
  if (!clientType) return [];
  const res = await query(
    `SELECT client_id, nama, client_type, client_status
     FROM clients
     WHERE LOWER(client_type) = LOWER($1)
     ORDER BY client_id`,
    [clientType]
  );
  return res.rows;
};

// Ambil client by client_id (case-insensitive)
export const findById = async (client_id) => {
  const res = await query(
    'SELECT * FROM clients WHERE LOWER(client_id) = LOWER($1)',
    [client_id]
  );
  return res.rows[0] || null;
};

// Ambil client berdasarkan group (case-insensitive)
export const findByGroup = async (group) => {
  const res = await query(
    'SELECT * FROM clients WHERE LOWER(client_group) = LOWER($1)',
    [group]
  );
  return res.rows;
};

// Ambil client berdasarkan nomor WhatsApp operator
export const findByOperator = async (waNumber) => {
  if (!waNumber) return null;
  const normalized = String(waNumber).replace(/\D/g, '');
  const waId = normalized.startsWith('62')
    ? normalized
    : '62' + normalized.replace(/^0/, '');
  const { rows } = await query(
    'SELECT * FROM clients WHERE client_operator = $1 LIMIT 1',
    [waId]
  );
  return rows[0] || null;
};

// Ambil client berdasarkan nomor WhatsApp super admin
export const findBySuperAdmin = async (waNumber) => {
  if (!waNumber) return null;

  const digitsOnly = String(waNumber).replace(/\D/g, "");
  if (!digitsOnly) return null;

  let waId = digitsOnly;
  if (waId.startsWith("0")) {
    waId = "62" + waId.slice(1);
  } else if (!waId.startsWith("62")) {
    waId = "62" + waId;
  }

  let params = [waId];
  let queryText = `
    SELECT *
    FROM clients
    WHERE client_super IS NOT NULL
      AND client_super <> ''
      AND client_super ~ ('(^|\\D)' || $1 || '(\\D|$)')
    LIMIT 1
  `;

  if (waId.startsWith("62") && waId.length > 2) {
    const localDigits = waId.slice(2).replace(/^0+/, "");
    if (localDigits) {
      const localFormat = "0" + localDigits;
      params = [waId, localFormat];
      queryText = `
        SELECT *
        FROM clients
        WHERE client_super IS NOT NULL
          AND client_super <> ''
          AND (
            client_super ~ ('(^|\\D)' || $1 || '(\\D|$)')
            OR client_super ~ ('(^|\\D)' || $2 || '(\\D|$)')
          )
        LIMIT 1
      `;
    }
  }

  const { rows } = await query(queryText, params);
  return rows[0] || null;
};

// Buat client baru
export const create = async (client) => {
  const includeParentClientId = await hasParentClientIdColumn();
  const columns = [
    "client_id",
    "nama",
    "client_type",
    "client_status",
    "client_insta",
    "client_insta_status",
    "client_tiktok",
    "client_tiktok_status",
    "client_amplify_status",
    "client_operator",
    "client_group",
    "regional_id",
    ...(includeParentClientId ? ["parent_client_id"] : []),
    "client_level",
    "tiktok_secuid",
    "client_super",
  ];
  const values = [
    client.client_id,
    client.nama,
    client.client_type || '',
    client.client_status ?? true,
    client.client_insta || '',
    client.client_insta_status ?? true,
    client.client_tiktok || '',
    client.client_tiktok_status ?? true,
    client.client_amplify_status ?? true,
    client.client_operator || '',
    client.client_group || '',
    client.regional_id || null,
    ...(includeParentClientId ? [client.parent_client_id || null] : []),
    client.client_level || null,
    client.tiktok_secuid || '',
    client.client_super || ''
  ];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const q = `
    INSERT INTO clients
      (${columns.join(", ")})
    VALUES
      (${placeholders})
    RETURNING *
  `;
  const res = await query(q, values);
  return res.rows[0];
};

// Update client, bisa update 1 key saja!
export const update = async (client_id, clientData) => {
  const old = await findById(client_id);
  if (!old) return null;
  const merged = { ...old, ...clientData };

  const includeParentClientId = await hasParentClientIdColumn();
  const updates = [
    { column: "nama", value: merged.nama },
    { column: "client_type", value: merged.client_type },
    { column: "client_status", value: merged.client_status },
    { column: "client_insta", value: merged.client_insta || "" },
    { column: "client_insta_status", value: merged.client_insta_status },
    { column: "client_tiktok", value: merged.client_tiktok || "" },
    { column: "client_tiktok_status", value: merged.client_tiktok_status },
    { column: "client_amplify_status", value: merged.client_amplify_status },
    { column: "client_operator", value: merged.client_operator },
    { column: "client_group", value: merged.client_group },
    { column: "regional_id", value: merged.regional_id || null },
    ...(includeParentClientId
      ? [{ column: "parent_client_id", value: merged.parent_client_id || null }]
      : []),
    { column: "client_level", value: merged.client_level || null },
    { column: "tiktok_secuid", value: merged.tiktok_secuid || "" },
    { column: "client_super", value: merged.client_super || "" },
  ];
  const setClause = updates
    .map((updateItem, index) => `${updateItem.column} = $${index + 2}`)
    .join(", ");
  const q = `
    UPDATE clients SET
      ${setClause}
    WHERE client_id = $1
    RETURNING *
  `;
  const values = [old.client_id, ...updates.map((updateItem) => updateItem.value)];
  const res = await query(q, values);
  return res.rows[0];
};

// Hapus client
export const remove = async (client_id) => {
  const res = await query('DELETE FROM clients WHERE client_id = $1 RETURNING *', [client_id]);
  return res.rows[0] || null;
};

// Ambil semua client aktif IG
export async function findAllActiveWithInstagram() {
  const res = await query(
    `SELECT * FROM clients WHERE client_status = true AND client_insta_status = true AND client_amplify_status = true`
  );
  return res.rows;
}

// Ambil semua client aktif TikTok
export async function findAllActiveWithTiktok() {
  const res = await query(
    `SELECT * FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_amplify_status = true`
  );
  return res.rows;
}

// [Opsional] Untuk statistik/rekap dashboard
export async function getAllClients() {
  const res = await query('SELECT * FROM clients');
  return res.rows;
}
export async function updateClientSecUid(client_id, secUid) {
  const res = await query(
    'UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2',
    [secUid, client_id]
  );
  return res.rowCount > 0;
}

export async function getAllClientIds() {
  const selectColumns = await buildClientSelect(
    ["client_id", "nama", "client_status", "regional_id", "client_level"],
    { includeParentClientId: true }
  );
  const rows = await query(
    `SELECT ${selectColumns} FROM clients ORDER BY client_id`
  );
  return rows.rows.map(r => ({
    client_id: r.client_id,
    nama: r.nama,
    status: r.client_status,
    regional_id: r.regional_id,
    parent_client_id: r.parent_client_id,
    client_level: r.client_level,
  }));
}

export async function findAllOrgClients() {
  const selectColumns = await buildClientSelect(
    ["client_id", "nama", "client_status", "regional_id", "client_level"],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients WHERE client_type = 'ORG' ORDER BY client_id`
  );
  return res.rows;
}

export async function findByRegionalId(regionalId) {
  if (!regionalId) return [];
  const selectColumns = await buildClientSelect(
    ["client_id", "nama", "client_type", "client_status", "regional_id", "client_level"],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE UPPER(regional_id) = UPPER($1)
     ORDER BY client_id`,
    [regionalId]
  );
  return res.rows;
}

export async function findChildrenByParent(parentClientId) {
  if (!parentClientId) return [];
  const hasParent = await hasParentClientIdColumn();
  if (!hasParent) return [];
  const selectColumns = await buildClientSelect(
    ["client_id", "nama", "client_type", "client_status", "regional_id", "client_level"],
    { includeParentClientId: true }
  );
  const res = await query(
    `SELECT ${selectColumns}
     FROM clients
     WHERE LOWER(parent_client_id) = LOWER($1)
     ORDER BY client_id`,
    [parentClientId]
  );
  return res.rows;
}
