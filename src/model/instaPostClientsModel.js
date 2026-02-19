// src/model/instaPostClientsModel.js
import { query } from '../repository/db.js';

/**
 * Add a client association to a shortcode (for collaboration posts)
 * @param {string} shortcode - Instagram post shortcode
 * @param {string} clientId - Client ID to associate
 */
export async function addClientToPost(shortcode, clientId) {
  await query(
    `INSERT INTO insta_post_clients (shortcode, client_id, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode, client_id) DO NOTHING`,
    [shortcode, clientId]
  );
}

/**
 * Get all client_ids associated with a shortcode
 * @param {string} shortcode - Instagram post shortcode
 * @returns {Promise<string[]>} Array of client IDs
 */
export async function getClientsByShortcode(shortcode) {
  const res = await query(
    'SELECT client_id FROM insta_post_clients WHERE shortcode = $1',
    [shortcode]
  );
  return res.rows.map((r) => r.client_id);
}

/**
 * Get all shortcodes associated with a client
 * @param {string} clientId - Client ID
 * @returns {Promise<string[]>} Array of shortcodes
 */
export async function getShortcodesByClient(clientId) {
  const res = await query(
    'SELECT shortcode FROM insta_post_clients WHERE client_id = $1',
    [clientId]
  );
  return res.rows.map((r) => r.shortcode);
}

/**
 * Remove a client association from a shortcode
 * @param {string} shortcode - Instagram post shortcode
 * @param {string} clientId - Client ID to remove
 */
export async function removeClientFromPost(shortcode, clientId) {
  await query(
    'DELETE FROM insta_post_clients WHERE shortcode = $1 AND client_id = $2',
    [shortcode, clientId]
  );
}

/**
 * Check if a shortcode is associated with any clients
 * @param {string} shortcode - Instagram post shortcode
 * @returns {Promise<boolean>} True if shortcode has at least one client association
 */
export async function hasAnyClients(shortcode) {
  const res = await query(
    'SELECT COUNT(*) as count FROM insta_post_clients WHERE shortcode = $1',
    [shortcode]
  );
  return parseInt(res.rows[0]?.count || '0', 10) > 0;
}

/**
 * Get all shortcodes for a client created today (Asia/Jakarta timezone)
 * @param {string} clientId - Client ID
 * @returns {Promise<string[]>} Array of shortcodes created today
 */
export async function getShortcodesTodayByClientFromJunction(clientId) {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const res = await query(
    `SELECT pc.shortcode 
     FROM insta_post_clients pc
     JOIN insta_post p ON p.shortcode = pc.shortcode
     WHERE pc.client_id = $1 
       AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
     ORDER BY p.created_at ASC, pc.shortcode ASC`,
    [clientId, today]
  );
  
  return res.rows.map((r) => r.shortcode);
}
