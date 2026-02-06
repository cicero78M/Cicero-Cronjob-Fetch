// src/service/tugasChangeDetector.js

import { query } from '../repository/db.js';

/**
 * Get recent Instagram posts for a client (last 24 hours)
 * @param {string} clientId - Client ID
 * @returns {Promise<Array>} Array of posts
 */
export async function getRecentInstaPosts(clientId) {
  try {
    const result = await query(
      `SELECT shortcode, caption, like_count, timestamp, created_at
       FROM insta_post
       WHERE LOWER(client_id) = LOWER($1)
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC`,
      [clientId]
    );
    return result.rows || [];
  } catch (error) {
    console.error('[TUGAS_DETECTOR] Error fetching recent Instagram posts:', error.message);
    return [];
  }
}

/**
 * Get recent TikTok posts for a client (last 24 hours)
 * @param {string} clientId - Client ID
 * @returns {Promise<Array>} Array of posts
 */
export async function getRecentTiktokPosts(clientId) {
  try {
    const result = await query(
      `SELECT video_id, description, author_username, created_at
       FROM tiktok_post
       WHERE LOWER(client_id) = LOWER($1)
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC`,
      [clientId]
    );
    return result.rows || [];
  } catch (error) {
    console.error('[TUGAS_DETECTOR] Error fetching recent TikTok posts:', error.message);
    return [];
  }
}

/**
 * Get recent link report changes (last 24 hours)
 * @param {string} clientId - Client ID
 * @returns {Promise<Array>} Array of link changes
 */
export async function getRecentLinkChanges(clientId) {
  try {
    const result = await query(
      `SELECT 
         r.shortcode,
         r.user_id,
         r.instagram_link,
         r.facebook_link,
         r.twitter_link,
         r.tiktok_link,
         r.youtube_link,
         r.created_at,
         u.nama as user_name
       FROM link_report r
       JOIN "user" u ON u.user_id = r.user_id
       JOIN insta_post p ON p.shortcode = r.shortcode
       WHERE LOWER(p.client_id) = LOWER($1)
         AND r.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY r.created_at DESC`,
      [clientId]
    );
    return result.rows || [];
  } catch (error) {
    console.error('[TUGAS_DETECTOR] Error fetching recent link changes:', error.message);
    return [];
  }
}

/**
 * Detect changes between previous and current state
 * @param {Object} previousState - Previous state with igCount and tiktokCount
 * @param {Object} currentState - Current state with igCount and tiktokCount
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} Changes object
 */
export async function detectChanges(previousState, currentState, clientId) {
  const changes = {
    igAdded: [],
    tiktokAdded: [],
    igDeleted: 0,
    tiktokDeleted: 0,
    linkChanges: []
  };

  try {
    // Detect Instagram additions
    const igDiff = currentState.igCount - previousState.igCount;
    if (igDiff > 0) {
      changes.igAdded = await getRecentInstaPosts(clientId);
      // Limit to actual new posts
      changes.igAdded = changes.igAdded.slice(0, igDiff);
    } else if (igDiff < 0) {
      changes.igDeleted = Math.abs(igDiff);
    }

    // Detect TikTok additions
    const tiktokDiff = currentState.tiktokCount - previousState.tiktokCount;
    if (tiktokDiff > 0) {
      changes.tiktokAdded = await getRecentTiktokPosts(clientId);
      // Limit to actual new posts
      changes.tiktokAdded = changes.tiktokAdded.slice(0, tiktokDiff);
    } else if (tiktokDiff < 0) {
      changes.tiktokDeleted = Math.abs(tiktokDiff);
    }

    // Get recent link changes
    changes.linkChanges = await getRecentLinkChanges(clientId);

  } catch (error) {
    console.error('[TUGAS_DETECTOR] Error detecting changes:', error.message);
  }

  return changes;
}

/**
 * Check if there are any notable changes
 * @param {Object} changes - Changes object
 * @returns {boolean} True if there are changes
 */
export function hasNotableChanges(changes) {
  return (
    (changes.igAdded && changes.igAdded.length > 0) ||
    (changes.tiktokAdded && changes.tiktokAdded.length > 0) ||
    changes.igDeleted > 0 ||
    changes.tiktokDeleted > 0 ||
    (changes.linkChanges && changes.linkChanges.length > 0)
  );
}
