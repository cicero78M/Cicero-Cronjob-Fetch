BEGIN;

UPDATE clients
SET regional_id = 'JATIM'
WHERE regional_id IS DISTINCT FROM 'JATIM';

INSERT INTO clients (
  client_id,
  nama,
  client_type,
  client_status,
  regional_id,
  client_level
)
VALUES (
  'POLDA_JATIM',
  'Polda Jawa Timur',
  'polda',
  TRUE,
  'JATIM',
  'polda'
)
ON CONFLICT (client_id) DO UPDATE
SET
  regional_id = EXCLUDED.regional_id,
  client_level = COALESCE(clients.client_level, EXCLUDED.client_level),
  client_type = COALESCE(clients.client_type, EXCLUDED.client_type),
  client_status = COALESCE(clients.client_status, EXCLUDED.client_status),
  nama = COALESCE(clients.nama, EXCLUDED.nama);

UPDATE "user"
SET client_id = 'POLDA_JATIM'
WHERE UPPER(client_id) IN ('POLDA JATIM', 'POLDA_JATIM');

UPDATE clients
SET parent_client_id = 'POLDA_JATIM'
WHERE client_id <> 'POLDA_JATIM'
  AND regional_id = 'JATIM'
  AND (
    client_level IN ('direktorat', 'satker')
    OR client_type IN ('direktorat', 'satker')
  );

COMMIT;
