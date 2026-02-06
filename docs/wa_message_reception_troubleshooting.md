# WhatsApp Bot Message Reception Troubleshooting Guide

## Overview
This guide helps diagnose issues when the WhatsApp bot can send messages but cannot receive or respond to incoming messages.

## Symptom
- Bot can send messages successfully ✓
- Bot cannot receive messages ✗
- No logs showing incoming message interactions

## Diagnostic Logging

The system includes comprehensive diagnostic logging to identify where the message reception flow breaks. These logs ALWAYS appear (not just in debug mode) to ensure visibility when troubleshooting.

### Expected Log Sequence

#### 1. Initialization Phase

```
[WWEBJS] Registering event listeners for clientId=wa-admin
[WWEBJS] Internal message handler registered for clientId=wa-admin
[WWEBJS] Client ready event received for clientId=wa-admin
[WWEBJS] Client wa-admin fully initialized and ready to receive messages
[WA] Message event listeners attached successfully
[WA] Listener counts - waClient: 1, waUserClient: 1, waGatewayClient: 1
```

#### 2. Message Reception Phase (when message arrives)

```
[WWEBJS-ADAPTER] Message received by internal handler - clientId=wa-admin, from=6281234567890@c.us
[WWEBJS-ADAPTER] Emitting 'message' event to emitter - clientId=wa-admin, from=6281234567890@c.us
[WA-SERVICE] waClient 'message' event received - from=6281234567890@c.us
[WA] Incoming message from 6281234567890@c.us: Hello
```

## Troubleshooting Decision Tree

### Step 1: Check Initialization Logs

**Q: Do you see "[WWEBJS] Registering event listeners for clientId=..." logs?**

- **NO** → Service not starting properly
  - Check service logs for startup errors
  - Verify Node.js is running
  - Check process manager (PM2, systemd, etc.)
  - Action: Fix service startup issues

- **YES** → Continue to Step 2

### Step 2: Check Client Ready State

**Q: Do you see "[WWEBJS] Client ... fully initialized and ready to receive messages" logs?**

- **NO** → WhatsApp client not connecting/authenticating
  - Check if QR code is displayed
  - Verify QR code is scanned
  - Check authentication session files exist
  - Look for auth_failure errors
  - Check puppeteer/chrome installation
  - Action: Re-authenticate WhatsApp client

- **YES** → Continue to Step 3

### Step 3: Check Listener Attachment

**Q: Do you see "[WA] Listener counts - waClient: 1, ..." with count > 0?**

- **NO** → Event listeners not being attached
  - Check `WA_SERVICE_SKIP_INIT` environment variable (should NOT be "true")
  - Check shouldInitWhatsAppClients flag
  - Look for errors during listener attachment
  - Action: Fix listener attachment configuration

- **YES** → Continue to Step 4

### Step 4: Check Message Arrival at Internal Handler

**Q: When you send a test message, do you see "[WWEBJS-ADAPTER] Message received by internal handler..."?**

- **NO** → WhatsApp client not receiving messages from WhatsApp
  - Verify WhatsApp account is active and not banned
  - Check WhatsApp Web connection status
  - Verify phone is online and connected
  - Check if WhatsApp app on phone is working
  - Look for disconnection logs
  - Check puppeteer/browser connection
  - Action: Fix WhatsApp account/connection issues

- **YES** → Continue to Step 5

### Step 5: Check Event Emission

**Q: Do you see "[WWEBJS-ADAPTER] Emitting 'message' event to emitter..."?**

- **NO** → Internal handler failing before emit
  - Check for errors in contact metadata fetch
  - Look for exceptions in internal handler
  - Enable `WA_DEBUG_LOGGING=true` for more details
  - Action: Fix internal handler error

- **YES** → Continue to Step 6

### Step 6: Check waService Event Reception

**Q: Do you see "[WA-SERVICE] waClient 'message' event received..."?**

- **NO** → Event not reaching waService
  - Event emission/propagation is broken
  - Verify emitter is correct object
  - Check if listeners were removed
  - Action: Review emitter/listener architecture (unlikely, needs code review)

- **YES** → Continue to Step 7

### Step 7: Check Message Processing

**Q: Do you see "[WA] Incoming message from ..." logs?**

- **NO** → handleIncoming or handleMessage failing
  - Check waEventAggregator for errors
  - Check if message is being deduplicated incorrectly
  - Look for errors in handleMessage function
  - Check if message is filtered out (group/status)
  - Action: Fix message processing logic

- **YES** → Message is being received! Check why bot isn't responding
  - Issue is in response logic, not reception
  - Check bot's response handlers
  - Check session management
  - Check database connections
  - Action: Debug response logic

## Common Issues and Solutions

### Issue 1: WA_SERVICE_SKIP_INIT is set to "true"

**Symptom**: No listener attachment logs, listener count is 0

**Solution**:
```bash
# Remove or set to false in .env file
WA_SERVICE_SKIP_INIT=false
# Or remove the line completely
```

### Issue 2: WhatsApp Client Not Authenticated

**Symptom**: No "[WWEBJS] Client ... fully initialized" log, may see QR code logs

**Solution**:
1. Check for QR code in logs
2. Scan QR code with WhatsApp mobile app
3. Wait for "ready" message
4. If session exists but not working, clear session:
   ```bash
   rm -rf ~/.cicero/wwebjs_auth/session-*
   # Restart service to regenerate QR code
   ```

### Issue 3: Puppeteer/Chrome Not Installed

**Symptom**: "Missing chrome" or "Chromium not found" errors during initialization

**Solution**:
```bash
# Install Chrome/Chromium
npx puppeteer browsers install chrome
# Or set custom path
export WA_PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

### Issue 4: Message Deduplication Issues

**Symptom**: First message works, subsequent messages don't

**Solution**:
```bash
# Adjust deduplication TTL
WA_MESSAGE_DEDUP_TTL_MS=3600000  # 1 hour instead of 24
```

### Issue 5: Phone Offline or Not Connected

**Symptom**: "[WWEBJS] Client ... fully initialized" appears, but no message logs when sending test messages

**Solution**:
1. Verify WhatsApp app is open on phone
2. Check phone has internet connection
3. Verify phone is not in airplane mode
4. Check WhatsApp Web is connected on phone

### Issue 6: WhatsApp Account Issues

**Symptom**: Cannot connect, repeated auth failures

**Solution**:
1. Check if account is banned or restricted
2. Try logging in to WhatsApp Web manually
3. Clear session and re-authenticate
4. Use different phone number if necessary

## Testing Message Reception

### Send Test Message

1. Send a test message to the bot from another WhatsApp account
2. Watch the logs for the expected log sequence
3. Identify where the log sequence stops
4. Follow the troubleshooting decision tree

### Test Commands

```bash
# Watch logs in real-time
tail -f /path/to/logs/cicero.log

# Or with PM2
pm2 logs cicero_v2

# Enable debug logging for more details
WA_DEBUG_LOGGING=true npm restart
```

## Debug Mode

For even more detailed logging, enable debug mode:

```bash
# In .env file
WA_DEBUG_LOGGING=true
```

This will add additional logs:
- Raw message body content
- Message ID details
- Store initialization details
- Retry attempt details

## Health Check

Check the WhatsApp service health endpoint:

```bash
curl http://localhost:3000/api/health/wa | jq
```

Expected response:
```json
{
  "status": "ok",
  "shouldInitWhatsAppClients": true,
  "clients": [
    {
      "label": "WA",
      "ready": true,
      "messageListenerCount": 1,
      "state": "CONNECTED"
    }
  ],
  "messageDeduplication": {
    "cacheSize": 42,
    "ttlMs": 86400000
  }
}
```

## Getting Help

If you've followed this guide and still have issues:

1. Collect the following information:
   - Complete startup logs (first 100 lines)
   - Logs when sending a test message
   - Output of health check endpoint
   - Environment configuration (without secrets)
   - Node.js version: `node --version`

2. Create a GitHub issue with:
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Collected diagnostic information

## Related Documentation

- [WhatsApp Best Practices](./wa_best_practices.md)
- [Memory Leak Fix Guide](./wa_memory_leak_fix.md)
- [GroupMetadata Fix](./fix-groupmetadata-availability.md)

## Quick Reference: Environment Variables

```bash
# Core Configuration
WA_SERVICE_SKIP_INIT=false          # Must be false for message reception
WA_DEBUG_LOGGING=true               # Enable detailed logging
WA_MESSAGE_DEDUP_TTL_MS=86400000    # Message dedup cache TTL (24h)
WA_STORE_INIT_DELAY_MS=2000         # Store initialization delay
WA_PUPPETEER_EXECUTABLE_PATH=       # Custom Chrome/Chromium path

# Client IDs (must be unique)
USER_WA_CLIENT_ID=wa-user           # User client ID
GATEWAY_WA_CLIENT_ID=wa-gateway     # Gateway client ID
```

## Conclusion

This troubleshooting guide should help you identify and fix message reception issues. The comprehensive diagnostic logging makes it clear where the message flow breaks, allowing for targeted fixes.

Remember: The bot must be able to **connect** → **authenticate** → **reach ready state** → **attach listeners** → **receive events** → **process messages** for full functionality.
