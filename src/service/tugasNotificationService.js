// src/service/tugasNotificationService.js

import { findById as findClientById } from '../model/clientModel.js';
import { safeSendMessage } from '../utils/waHelper.js';
import { getPostsTodayByClient as getPostsTodayByClientInsta } from '../model/instaPostModel.js';
import { getPostsTodayByClient as getPostsTodayByClientTiktok } from '../model/tiktokPostModel.js';
import { enqueueOutboxEvents } from '../model/waNotificationOutboxModel.js';
import { createHash } from 'crypto';

const LOG_TAG = 'TUGAS_NOTIFICATION';
const jakartaDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const indonesianNumberFormatter = new Intl.NumberFormat('id-ID');

const jakartaHumanDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Truncate text with ellipsis if it exceeds max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Format number using Indonesian locale
 * @param {number|string} value - Numeric value
 * @param {number|string} fallback - Fallback value when not a valid number
 * @returns {string} Formatted number text
 */
function formatCount(value, fallback = 0) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `${fallback}`;
  }

  return indonesianNumberFormatter.format(numericValue);
}

/**
 * Format date time into Jakarta timezone display with WIB suffix
 * @param {string|Date} value - Date value
 * @returns {string} Formatted date time
 */
function formatJakartaDateTime(value) {
  if (!value) return '-';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return `${jakartaDateTimeFormatter.format(date)} WIB`;
}

/**
 * Format message for Instagram post additions
 * @param {Array} posts - Array of new Instagram posts
 * @param {string} clientName - Name of the client
 * @returns {string} Formatted message
 */
function formatInstaPostAdditions(posts, clientName) {
  if (!posts || posts.length === 0) return '';
  
  const lines = [
    `📸 *Tugas Instagram Baru - ${clientName}*`,
    '',
    `Terdapat *${posts.length}* konten Instagram baru yang perlu dikerjakan:`,
    ''
  ];

  posts.forEach((post, index) => {
    const shortcode = post.shortcode || '';
    const caption = post.caption ? truncateText(post.caption, 80) : '(Tidak ada caption)';
    const link = `https://www.instagram.com/p/${shortcode}/`;
    
    lines.push(`${index + 1}. *Post ${shortcode}*`);
    lines.push(`   Caption: _${caption}_`);
    lines.push(`   Link: ${link}`);
    lines.push('');
  });

  lines.push('_Silakan like dan beri komentar pada konten di atas._');
  
  return lines.join('\n');
}

/**
 * Format message for TikTok post additions
 * @param {Array} posts - Array of new TikTok posts
 * @param {string} clientName - Name of the client
 * @returns {string} Formatted message
 */
function formatTiktokPostAdditions(posts, clientName) {
  if (!posts || posts.length === 0) return '';
  
  const lines = [
    `🎵 *Tugas TikTok Baru - ${clientName}*`,
    '',
    `Terdapat *${posts.length}* konten TikTok baru yang perlu dikerjakan:`,
    ''
  ];

  posts.forEach((post, index) => {
    const videoId = post.video_id || '';
    const description = post.caption ? truncateText(post.caption, 80) : '(Tidak ada deskripsi)';
    const link = `https://www.tiktok.com/@${post.author_username || 'user'}/video/${videoId}`;
    
    lines.push(`${index + 1}. *Video ${videoId}*`);
    lines.push(`   Deskripsi: _${description}_`);
    lines.push(`   Link: ${link}`);
    lines.push('');
  });

  lines.push('_Silakan beri komentar pada video di atas._');
  
  return lines.join('\n');
}

/**
 * Format message for post deletions
 * @param {Object} changes - Object containing igDeleted and tiktokDeleted counts
 * @param {string} clientName - Name of the client
 * @returns {string} Formatted message
 */
function formatPostDeletions(changes, clientName) {
  const { igDeleted = 0, tiktokDeleted = 0 } = changes;
  
  if (igDeleted === 0 && tiktokDeleted === 0) return '';
  
  const lines = [
    `🗑️ *Perubahan Tugas - ${clientName}*`,
    ''
  ];

  if (igDeleted > 0) {
    lines.push(`📸 *${igDeleted}* konten Instagram telah dihapus dari daftar tugas.`);
  }
  
  if (tiktokDeleted > 0) {
    lines.push(`🎵 *${tiktokDeleted}* konten TikTok telah dihapus dari daftar tugas.`);
  }

  lines.push('');
  lines.push('_Tugas yang dihapus tidak perlu dikerjakan lagi._');
  
  return lines.join('\n');
}

/**
 * Format message for link changes
 * @param {Array} linkChanges - Array of link report changes
 * @param {string} clientName - Name of the client
 * @returns {string} Formatted message
 */
function formatLinkChanges(linkChanges, clientName) {
  if (!linkChanges || linkChanges.length === 0) return '';
  
  const lines = [
    `🔗 *Perubahan Link Tugas - ${clientName}*`,
    '',
    `Terdapat *${linkChanges.length}* perubahan link amplifikasi:`,
    ''
  ];

  linkChanges.forEach((change, index) => {
    const shortcode = change.shortcode || '';
    const userName = change.user_name || 'User';
    
    lines.push(`${index + 1}. *${userName}*`);
    lines.push(`   Post: ${shortcode}`);
    
    const links = [];
    if (change.instagram_link) links.push(`IG: ${change.instagram_link}`);
    if (change.facebook_link) links.push(`FB: ${change.facebook_link}`);
    if (change.twitter_link) links.push(`X: ${change.twitter_link}`);
    if (change.tiktok_link) links.push(`TT: ${change.tiktok_link}`);
    if (change.youtube_link) links.push(`YT: ${change.youtube_link}`);
    
    if (links.length > 0) {
      lines.push(`   Link: ${links.join(', ')}`);
    }
    
    lines.push('');
  });

  lines.push('_Link amplifikasi telah diperbarui._');
  
  return lines.join('\n');
}

/**
 * Normalize WhatsApp group ID to Baileys format
 * Handles various formats: 
 * - 120363XXXXXXXXX@g.us (already correct)
 * - 120363XXXXXXXXX-YYYYYYYYYY@g.us (with additional ID)
 * - 120363XXXXXXXXX (missing @g.us)
 * - +62812XXXX or 0812XXXX (phone numbers that should be group IDs)
 * @param {string} groupId - Group ID in any format
 * @returns {string} Normalized group ID in Baileys format
 */
function normalizeGroupId(groupId) {
  if (!groupId || typeof groupId !== 'string') {
    return '';
  }

  const trimmed = groupId.trim();
  if (!trimmed) return '';

  // If already has @g.us suffix, return as-is
  if (trimmed.endsWith('@g.us')) {
    return trimmed;
  }

  // If has @s.whatsapp.net or @c.us suffix (individual chat), this is wrong format
  // Group IDs should always end with @g.us
  if (trimmed.endsWith('@s.whatsapp.net') || trimmed.endsWith('@c.us')) {
    console.warn(`[${LOG_TAG}] Invalid group ID format (individual chat ID): ${trimmed}`);
    return '';
  }

  // If it looks like a group ID without suffix, add @g.us
  // Group IDs typically start with digits (e.g., 120363...)
  if (/^\d+(-\d+)?$/.test(trimmed)) {
    return `${trimmed}@g.us`;
  }

  // Log warning for unexpected format
  console.warn(`[${LOG_TAG}] Unexpected group ID format: ${trimmed}`);
  return '';
}

/**
 * Get active Instagram posts for a client (today only, Jakarta timezone)
 * @param {string} clientId - Client ID
 * @returns {Promise<Array>} Array of Instagram posts
 */
async function getActiveInstaPosts(clientId) {
  try {
    const posts = await getPostsTodayByClientInsta(clientId);
    return posts || [];
  } catch (error) {
    console.error(`[${LOG_TAG}] Error fetching Instagram posts:`, error.message);
    return [];
  }
}

/**
 * Get active TikTok posts for a client (today only, Jakarta timezone)
 * @param {string} clientId - Client ID
 * @returns {Promise<Array>} Array of TikTok posts
 */
async function getActiveTiktokPosts(clientId) {
  try {
    const posts = await getPostsTodayByClientTiktok(clientId);
    return posts || [];
  } catch (error) {
    console.error(`[${LOG_TAG}] Error fetching TikTok posts:`, error.message);
    return [];
  }
}

/**
 * Format Instagram task list section with links
 * @param {Array} posts - Array of Instagram posts
 * @returns {string} Formatted Instagram section
 */
function formatInstaTaskSection(posts) {
  if (!posts || posts.length === 0) return '';
  
  const lines = [
    `📸 *Tugas Instagram (${posts.length} konten):*`,
    ''
  ];

  posts.forEach((post, index) => {
    const shortcode = post.shortcode || '';
    const caption = post.caption ? truncateText(post.caption, 60) : '(Tidak ada caption)';
    const link = `https://www.instagram.com/p/${shortcode}/`;
    const uploadDate = formatJakartaDateTime(post.created_at);
    const likeText = post.like_count == null ? '-' : formatCount(post.like_count, 0);
    const commentText = formatCount(post.comment_count, 0);

    lines.push(`${index + 1}. ${link}`);
    lines.push(`   _${caption}_`);
    lines.push(`   Upload: ${uploadDate}`);
    lines.push(`   Likes: ${likeText} | Komentar: ${commentText}`);
  });

  lines.push('');
  return lines.join('\n');
}

/**
 * Format TikTok task list section with links
 * @param {Array} posts - Array of TikTok posts
 * @returns {string} Formatted TikTok section
 */
function formatTiktokTaskSection(posts) {
  if (!posts || posts.length === 0) return '';
  
  const lines = [
    `🎵 *Tugas TikTok (${posts.length} konten):*`,
    ''
  ];

  posts.forEach((post, index) => {
    const videoId = post.video_id || '';
    const description = post.caption ? truncateText(post.caption, 60) : '(Tidak ada deskripsi)';
    const username = post.author_username || 'user';
    const link = `https://www.tiktok.com/@${username}/video/${videoId}`;
    const uploadDate = formatJakartaDateTime(post.created_at);
    const likeText = formatCount(post.like_count, 0);
    const commentText = formatCount(post.comment_count, 0);
    
    lines.push(`${index + 1}. ${link}`);
    lines.push(`   _${description}_`);
    lines.push(`   Upload: ${uploadDate}`);
    lines.push(`   Likes: ${likeText} | Komentar: ${commentText}`);
  });

  lines.push('');
  return lines.join('\n');
}

/**
 * Format task list message for scheduled notifications
 * @param {string} clientName - Name of the client
 * @param {Object} changes - Changes object (may be empty)
 * @param {string} clientId - Client ID (to fetch posts)
 * @returns {Promise<string>} Formatted message
 */
async function formatScheduledTaskList(clientName, changes = null, clientId = null) {
  const generatedAt = formatJakartaHumanTimestamp();

  // Fetch actual posts first to get accurate counts
  let instaPosts = [];
  let tiktokPosts = [];
  
  if (clientId) {
    instaPosts = await getActiveInstaPosts(clientId);
    tiktokPosts = await getActiveTiktokPosts(clientId);
  }
  
  // Use actual fetched post counts instead of parameters
  const actualIgCount = instaPosts.length;
  const actualTiktokCount = tiktokPosts.length;
  
  const lines = [
    `📋 *Daftar Tugas - ${clientName}*`,
    `🕒 Pengambilan data: ${generatedAt}`,
    '',
    `Status tugas saat ini:`,
    `📸 Instagram: *${actualIgCount}* konten`,
    `🎵 TikTok: *${actualTiktokCount}* konten`,
    ''
  ];

  // Add change summary if there are changes
  if (changes && hasChanges(changes)) {
    lines.push('📊 *Perubahan Hari Ini:*');
    
    if (changes.igAdded && changes.igAdded.length > 0) {
      lines.push(`✅ +${changes.igAdded.length} konten Instagram baru`);
    }
    
    if (changes.tiktokAdded && changes.tiktokAdded.length > 0) {
      lines.push(`✅ +${changes.tiktokAdded.length} konten TikTok baru`);
    }
    
    if (changes.igDeleted > 0) {
      lines.push(`❌ -${changes.igDeleted} konten Instagram dihapus`);
    }
    
    if (changes.tiktokDeleted > 0) {
      lines.push(`❌ -${changes.tiktokDeleted} konten TikTok dihapus`);
    }
    
    if (changes.linkChanges && changes.linkChanges.length > 0) {
      lines.push(`🔗 ~${changes.linkChanges.length} perubahan link amplifikasi`);
    }
    
    lines.push('');
  }

  // Add actual task links grouped by platform
  if (clientId && (instaPosts.length > 0 || tiktokPosts.length > 0)) {
    lines.push('📝 *Detail Tugas:*');
    lines.push('');
    
    // Add Instagram posts (already fetched)
    const instaSection = formatInstaTaskSection(instaPosts);
    if (instaSection) {
      lines.push(instaSection);
    }
    
    // Add TikTok posts (already fetched)
    const tiktokSection = formatTiktokTaskSection(tiktokPosts);
    if (tiktokSection) {
      lines.push(tiktokSection);
    }
  }

  lines.push('_Pastikan semua tugas telah dikerjakan dengan baik._');
  
  return lines.join('\n');
}

/**
 * Check if changes object has any changes (helper for scheduled notifications)
 * @param {Object} changes - Changes object
 * @returns {boolean} True if there are changes
 */
function hasChanges(changes) {
  if (!changes) return false;
  return (
    (changes.igAdded && changes.igAdded.length > 0) ||
    (changes.tiktokAdded && changes.tiktokAdded.length > 0) ||
    changes.igDeleted > 0 ||
    changes.tiktokDeleted > 0 ||
    (changes.linkChanges && changes.linkChanges.length > 0)
  );
}

/**
 * Send task notification to WhatsApp group
 * @param {Object} waClient - WhatsApp client instance
 * @param {string} clientId - Client ID
 * @param {Object} changes - Object containing change details
 * @param {Object} options - Optional parameters
 * @param {boolean} options.forceScheduled - Force send as scheduled notification (always send)
 * @param {number} options.igCount - Current Instagram count (for scheduled notifications)
 * @param {number} options.tiktokCount - Current TikTok count (for scheduled notifications)
 * @returns {Promise<boolean>} Success status
 */
export async function sendTugasNotification(waClient, clientId, changes, options = {}) {
  try {
    const { forceScheduled = false, igCount = 0, tiktokCount = 0 } = options;

    if (!waClient) {
      console.warn(`[${LOG_TAG}] WhatsApp client not available`);
      return false;
    }

    if (!clientId) {
      console.warn(`[${LOG_TAG}] Client ID is required`);
      return false;
    }

    // Get client data
    const client = await findClientById(clientId);
    if (!client) {
      console.warn(`[${LOG_TAG}] Client not found: ${clientId}`);
      return false;
    }

    // Get WhatsApp group ID from client_group field
    const clientGroup = client.client_group;
    if (!clientGroup || clientGroup.trim() === '') {
      console.log(`[${LOG_TAG}] No WhatsApp group configured for client: ${clientId}`);
      return false;
    }

    // Parse group IDs (can be multiple, separated by comma or semicolon)
    const rawGroupIds = clientGroup
      .split(/[,;]/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    // Normalize all group IDs to proper Baileys format
    const groupIds = rawGroupIds
      .map(id => normalizeGroupId(id))
      .filter(id => id.length > 0);

    if (groupIds.length === 0) {
      console.log(`[${LOG_TAG}] No valid WhatsApp group IDs for client: ${clientId} (raw: ${rawGroupIds.join(', ')})`);
      return false;
    }

    const clientName = client.nama || clientId;
    const messages = [];

    // If this is a scheduled notification, build scheduled task list
    if (forceScheduled) {
      const scheduledMsg = await formatScheduledTaskList(clientName, changes, clientId);
      if (scheduledMsg) messages.push(scheduledMsg);
    } else {
      // Build messages based on changes (original behavior)
      if (changes.igAdded && changes.igAdded.length > 0) {
        const msg = formatInstaPostAdditions(changes.igAdded, clientName);
        if (msg) messages.push(msg);
      }

      if (changes.tiktokAdded && changes.tiktokAdded.length > 0) {
        const msg = formatTiktokPostAdditions(changes.tiktokAdded, clientName);
        if (msg) messages.push(msg);
      }

      if (changes.igDeleted > 0 || changes.tiktokDeleted > 0) {
        const msg = formatPostDeletions(changes, clientName);
        if (msg) messages.push(msg);
      }

      if (changes.linkChanges && changes.linkChanges.length > 0) {
        const msg = formatLinkChanges(changes.linkChanges, clientName);
        if (msg) messages.push(msg);
      }
    }

    // If no messages to send, return early
    if (messages.length === 0) {
      console.log(`[${LOG_TAG}] No changes to notify for client: ${clientId}`);
      return false;
    }

    // Send messages to all configured groups
    let sentCount = 0;
    for (const groupId of groupIds) {
      console.log(`[${LOG_TAG}] Preparing to send ${messages.length} message(s) to group ${groupId} for client ${clientId}`);
      
      for (const message of messages) {
        try {
          const messagePreview = message.length > 80 ? message.substring(0, 80) + '...' : message;
          console.log(`[${LOG_TAG}] Sending message to ${groupId}: ${messagePreview}`);
          
          const result = await safeSendMessage(waClient, groupId, message);
          
          if (result) {
            sentCount++;
            console.log(`[${LOG_TAG}] ✅ Successfully sent notification to group ${groupId} for client ${clientId}`);
          } else {
            console.warn(`[${LOG_TAG}] ⚠️ safeSendMessage returned false for group ${groupId}`);
          }
        } catch (err) {
          console.error(`[${LOG_TAG}] ❌ Failed to send to group ${groupId}:`, err.message);
        }
      }
    }

    return sentCount > 0;
  } catch (error) {
    console.error(`[${LOG_TAG}] Error sending task notification:`, error.message);
    return false;
  }
}

function buildIdempotencyHash(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function getJakartaHourKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  return formatter.format(date).replace(' ', 'T').replace(/-/g, '');
}

export async function buildTugasNotificationPayload(clientId, changes, options = {}) {
  const { forceScheduled = false } = options;

  if (!clientId) {
    return null;
  }

  const client = await findClientById(clientId);
  if (!client) {
    return null;
  }

  const clientGroup = client.client_group;
  if (!clientGroup || clientGroup.trim() === '') {
    return null;
  }

  const rawGroupIds = clientGroup
    .split(/[,;]/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const groupIds = rawGroupIds
    .map((id) => normalizeGroupId(id))
    .filter((id) => id.length > 0);

  if (groupIds.length === 0) {
    return null;
  }

  const clientName = client.nama || clientId;
  const messages = [];

  if (forceScheduled) {
    const scheduledMsg = await formatScheduledTaskList(clientName, changes, clientId);
    if (scheduledMsg) messages.push(scheduledMsg);
  } else {
    if (changes.igAdded && changes.igAdded.length > 0) {
      const msg = formatInstaPostAdditions(changes.igAdded, clientName);
      if (msg) messages.push(msg);
    }

    if (changes.tiktokAdded && changes.tiktokAdded.length > 0) {
      const msg = formatTiktokPostAdditions(changes.tiktokAdded, clientName);
      if (msg) messages.push(msg);
    }

    if (changes.igDeleted > 0 || changes.tiktokDeleted > 0) {
      const msg = formatPostDeletions(changes, clientName);
      if (msg) messages.push(msg);
    }

    if (changes.linkChanges && changes.linkChanges.length > 0) {
      const msg = formatLinkChanges(changes.linkChanges, clientName);
      if (msg) messages.push(msg);
    }
  }

  if (messages.length === 0) {
    return null;
  }

  return {
    clientId,
    groupIds,
    messages,
    forceScheduled,
  };
}

export async function enqueueTugasNotification(clientId, changes, options = {}) {
  const payload = await buildTugasNotificationPayload(clientId, changes, options);
  if (!payload) {
    return { enqueuedCount: 0, duplicatedCount: 0 };
  }

  const { groupIds, messages, forceScheduled } = payload;
  const hourKey = getJakartaHourKey();

  const outboxEvents = [];
  for (const groupId of groupIds) {
    for (const message of messages) {
      const idempotencySeed = forceScheduled
        ? `${clientId}|${groupId}|scheduled|${hourKey}|${message}`
        : `${clientId}|${groupId}|change|${message}`;

      outboxEvents.push({
        clientId,
        groupId,
        message,
        idempotencyKey: buildIdempotencyHash(idempotencySeed),
        maxAttempts: 5,
      });
    }
  }

  const result = await enqueueOutboxEvents(outboxEvents);
  return {
    enqueuedCount: result.insertedCount,
    duplicatedCount: result.duplicatedCount,
  };
}

/**
 * Build change summary for logging
 * @param {Object} changes - Object containing change details
 * @returns {string} Summary string
 */
export function buildChangeSummary(changes) {
  const parts = [];
  
  if (changes.igAdded && changes.igAdded.length > 0) {
    parts.push(`+${changes.igAdded.length} IG posts`);
  }
  
  if (changes.tiktokAdded && changes.tiktokAdded.length > 0) {
    parts.push(`+${changes.tiktokAdded.length} TikTok posts`);
  }
  
  if (changes.igDeleted > 0) {
    parts.push(`-${changes.igDeleted} IG posts`);
  }
  
  if (changes.tiktokDeleted > 0) {
    parts.push(`-${changes.tiktokDeleted} TikTok posts`);
  }
  
  if (changes.linkChanges && changes.linkChanges.length > 0) {
    parts.push(`~${changes.linkChanges.length} link changes`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'no changes';
}
