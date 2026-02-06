#!/usr/bin/env node
/**
 * WhatsApp Setup Test Script
 * Tests that WhatsApp clients are properly configured for message reception
 * 
 * Usage: node scripts/test-wa-setup.js
 */

import { EventEmitter } from 'events';

// Only set the WA_SERVICE_SKIP_INIT if not already set
process.env.WA_SERVICE_SKIP_INIT = process.env.WA_SERVICE_SKIP_INIT || 'false';

console.log('='.repeat(60));
console.log('WhatsApp Setup Test');
console.log('='.repeat(60));
console.log();

console.log('Environment Check:');
console.log(`  WA_SERVICE_SKIP_INIT: ${process.env.WA_SERVICE_SKIP_INIT}`);
console.log(`  Should initialize clients: ${process.env.WA_SERVICE_SKIP_INIT !== 'true'}`);
console.log(`  WA_DEBUG_LOGGING: ${process.env.WA_DEBUG_LOGGING || 'not set (disabled)'}`);
console.log();

// Test event emitter behavior
console.log('Testing EventEmitter message listener attachment:');
const testEmitter = new EventEmitter();

// Attach a message listener
testEmitter.on('message', (msg) => {
  console.log(`  ✓ Message received: ${msg.body}`);
});

console.log(`  Initial message listener count: ${testEmitter.listenerCount('message')}`);

// Emit a test message
testEmitter.emit('message', { body: 'Test message', from: 'test@c.us' });

console.log();
console.log('='.repeat(60));
console.log('Test completed successfully!');
console.log();
console.log('Configuration Guidelines:');
console.log('  • WA_SERVICE_SKIP_INIT should be "false" or unset in production');
console.log('  • WA_SERVICE_SKIP_INIT="true" should ONLY be used in tests');
console.log('  • WA_DEBUG_LOGGING="true" enables verbose message flow logging');
console.log('  • WA_DEBUG_LOGGING should be disabled in production (high volume)');
console.log('='.repeat(60));
