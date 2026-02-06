#!/usr/bin/env node

/**
 * Diagnostic script to check if WhatsApp message listeners are properly attached
 * Usage: node scripts/diagnose-wa-listeners.js
 * 
 * NOTE: This script sets WA_SERVICE_SKIP_INIT=true to prevent actual WhatsApp initialization,
 * which means it only shows the client objects' structure, not the runtime listener state.
 * For runtime diagnostics, check the application logs during normal operation.
 */

// Set environment to skip actual initialization but allow module loading
process.env.WA_SERVICE_SKIP_INIT = 'true';
process.env.NODE_ENV = 'test';

import { waClient, waUserClient, waGatewayClient } from '../src/service/waService.js';

console.log('\n========== WhatsApp Listener Diagnostics ==========\n');

const clients = [
  { name: 'waClient', client: waClient },
  { name: 'waUserClient', client: waUserClient },
  { name: 'waGatewayClient', client: waGatewayClient },
];

clients.forEach(({ name, client }) => {
  console.log(`--- ${name} ---`);
  console.log(`  Exists: ${!!client}`);
  console.log(`  Is EventEmitter: ${typeof client?.on === 'function'}`);
  console.log(`  Has listenerCount: ${typeof client?.listenerCount === 'function'}`);
  
  if (client && typeof client.listenerCount === 'function') {
    console.log(`  'message' listeners: ${client.listenerCount('message')}`);
    console.log(`  'ready' listeners: ${client.listenerCount('ready')}`);
    console.log(`  'qr' listeners: ${client.listenerCount('qr')}`);
    console.log(`  'authenticated' listeners: ${client.listenerCount('authenticated')}`);
    console.log(`  'disconnected' listeners: ${client.listenerCount('disconnected')}`);
  }
  console.log('');
});

console.log('========== End Diagnostics ==========\n');

// Exit gracefully
process.exit(0);
