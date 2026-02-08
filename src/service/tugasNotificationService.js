// src/service/tugasNotificationService.js

import { findById as findClientById } from '../model/clientModel.js';
import { safeSendMessage } from '../utils/waHelper.js';

const LOG_TAG = 'TUGAS_NOTIFICATION';

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
    const caption = post.caption ? 
      (post.caption.length > 80 ? post.caption.substring(0, 80) + '...' : post.caption) : 
      '(Tidak ada caption)';
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
    const description = post.description ? 
      (post.description.length > 80 ? post.description.substring(0, 80) + '...' : post.description) : 
      '(Tidak ada deskripsi)';
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
 * Send task notification to WhatsApp group
 * @param {Object} waClient - WhatsApp client instance
 * @param {string} clientId - Client ID
 * @param {Object} changes - Object containing change details
 * @returns {Promise<boolean>} Success status
 */
export async function sendTugasNotification(waClient, clientId, changes) {
  try {
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
    const groupIds = clientGroup
      .split(/[,;]/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (groupIds.length === 0) {
      console.log(`[${LOG_TAG}] No valid WhatsApp group IDs for client: ${clientId}`);
      return false;
    }

    const clientName = client.nama || clientId;
    const messages = [];

    // Build messages based on changes
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

    // If no messages to send, return early
    if (messages.length === 0) {
      console.log(`[${LOG_TAG}] No changes to notify for client: ${clientId}`);
      return false;
    }

    // Send messages to all configured groups
    let sentCount = 0;
    for (const groupId of groupIds) {
      // Ensure group ID has proper format
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      console.log(`[${LOG_TAG}] Preparing to send ${messages.length} message(s) to group ${formattedGroupId} for client ${clientId}`);
      
      for (const message of messages) {
        try {
          const messagePreview = message.length > 80 ? message.substring(0, 80) + '...' : message;
          console.log(`[${LOG_TAG}] Sending message to ${formattedGroupId}: ${messagePreview}`);
          
          const result = await safeSendMessage(waClient, formattedGroupId, message);
          
          if (result) {
            sentCount++;
            console.log(`[${LOG_TAG}] ✅ Successfully sent notification to group ${formattedGroupId} for client ${clientId}`);
          } else {
            console.warn(`[${LOG_TAG}] ⚠️ safeSendMessage returned false for group ${formattedGroupId}`);
          }
        } catch (err) {
          console.error(`[${LOG_TAG}] ❌ Failed to send to group ${formattedGroupId}:`, err.message);
        }
      }
    }

    return sentCount > 0;
  } catch (error) {
    console.error(`[${LOG_TAG}] Error sending task notification:`, error.message);
    return false;
  }
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
