# WhatsApp Bot No Logs Troubleshooting Guide

## Problem
WhatsApp bot is not responding to messages AND no logs are being recorded when messages are sent to the WhatsApp number.

## Understanding the Issue

If you see **NO LOGS AT ALL** when sending messages to your WhatsApp bot, this means the message never reached the bot's internal handlers. The extensive logging infrastructure is already in place, so the absence of logs indicates a deeper issue with client initialization or connection.

## Diagnostic Steps

### Step 1: Check if the Application is Running

First, verify your application is actually running:

```bash
# Check if the process is running
ps aux | grep node | grep app.js

# Or if using PM2
pm2 list

# Check the main application log
tail -f /path/to/your/app.log
```

If the app is not running, start it:
```bash
npm start
# or
pm2 start ecosystem.config.js
```

### Step 2: Check Startup Logs

When the application starts, you should see these log messages in order:

1. **Client Creation:**
   ```
   [WWEBJS] Client created for clientId=wa-admin, event listeners registered
   ```

2. **Listener Attachment:**
   ```
   [WA] Attaching message event listeners to WhatsApp clients...
   [WA] Message event listeners attached successfully.
   [WA] Listener counts - waClient: 1, waUserClient: 1, waGatewayClient: 1
   ```

3. **Client Initialization:**
   ```
   [WA] Starting WhatsApp client initialization
   [WA-USER] Starting WhatsApp client initialization  
   [WA-GATEWAY] Starting WhatsApp client initialization
   ```

4. **Authentication (QR Code or Session Restore):**
   ```
   # If QR code needed:
   [WWEBJS] QR code for clientId=wa-admin
   # (QR code will be displayed in terminal)
   
   # If session exists:
   [WWEBJS] Restoring session for clientId=wa-admin
   ```

5. **Ready State:**
   ```
   [WWEBJS] Client ready event received for clientId=wa-admin
   [WWEBJS] Client wa-admin fully initialized and ready to receive messages
   ```

**If you DON'T see these logs**, proceed to Step 3.

### Step 3: Check for Initialization Errors

Look for error messages in your logs:

#### Common Error 1: Missing Chrome/Chromium
Error output:
```
[WWEBJS] Initialization failed: Error: missing-chrome: Chrome executable not found
Hint: set WA_PUPPETEER_EXECUTABLE_PATH or run "npx puppeteer browsers install chrome".
```

**Solution:**
```bash
# Set the Chrome executable path
export WA_PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
# or
export WA_PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Or install Chrome:
npx puppeteer browsers install chrome
```

#### Common Error 2: Authentication Failure
Error output:
```
[WWEBJS] auth_failure for clientId=wa-admin: Session auth failed
```

**Solution:**
- Scan the QR code again (it will be displayed in the terminal)
- Or clear the session and re-authenticate:
  ```bash
  export WA_AUTH_CLEAR_SESSION_ON_REINIT=true
  # Restart the application
  ```

#### Common Error 3: Session Lock (Multiple Instances)
Error output:
```
[WWEBJS] WA_WWEBJS_SHARED_SESSION_LOCK: Browser lock is active
Another WhatsApp client instance is using this session
```

**Solution:**
- Only one instance can use a WhatsApp session at a time
- Stop other instances or use different CLIENT_IDs

### Step 4: Check Client Status via Health Endpoint

While the app is running, check the health endpoint:

```bash
curl http://localhost:3000/api/health/wa
```

Expected response when everything is working:
```json
{
  "status": "ok",
  "shouldInitWhatsAppClients": true,
  "clients": [
    {
      "label": "WA",
      "ready": true,
      "awaitingQrScan": false,
      "messageListenerCount": 1,
      "fatalInitError": null
    }
  ]
}
```

**Problem indicators:**
- `ready: false` - Client not initialized/connected
- `awaitingQrScan: true` - QR code not scanned
- `fatalInitError: {...}` - Fatal error occurred
- `messageListenerCount: 0` - Listeners not attached (check WA_SERVICE_SKIP_INIT)

### Step 5: Test Message Flow

Once the client shows `ready: true`, send a test message to your WhatsApp number.

**Expected log sequence:**
```
[WWEBJS-ADAPTER] *** MESSAGE EVENT TRIGGERED *** clientId=wa-admin, from=628xxx
[WWEBJS-ADAPTER] Emitting 'message' event to emitter - clientId=wa-admin, from=628xxx
[WA-SERVICE] waClient 'message' event received - from=628xxx@c.us
[WA-EVENT-AGGREGATOR] Message received from adapter: wwebjs, jid: 628xxx@c.us
[WA] Incoming message from 628xxx@c.us: [message text]
```

**If you see log #1** but not the others:
- The whatsapp-web.js library is working
- Problem is with event relay (check emitter configuration)

**If you don't see log #1:**
- The whatsapp-web.js client is not receiving messages from WhatsApp
- Check connection status (Step 4)
- Verify phone is connected to internet
- Check if WhatsApp Web is active on other devices (max 4 linked devices)

## Common Causes and Solutions

### Cause 1: Client Never Reaches Ready State

**Symptoms:**
- Logs show initialization starting but never show "ready event received"
- No QR code displayed
- App seems stuck

**Solutions:**
1. Check Chrome/Chromium installation
2. Increase timeout: `export WA_WWEBJS_PROTOCOL_TIMEOUT_MS=300000`
3. Check network connectivity
4. Clear session and restart: `rm -rf ~/.cicero/wwebjs_auth/session-wa-admin`

### Cause 2: QR Code Not Scanned

**Symptoms:**
- `awaitingQrScan: true` in health check
- QR code displayed in terminal but not scanned
- Client not reaching ready state

**Solutions:**
1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Scan the QR code from the terminal
4. Wait for "ready event received" log

### Cause 3: Session Expired

**Symptoms:**
- Client was working before but suddenly stopped
- No QR code displayed
- Client seems connected but no messages received

**Solutions:**
1. Clear session and re-authenticate:
   ```bash
   export WA_AUTH_CLEAR_SESSION_ON_REINIT=true
   pm2 restart cicero
   ```
2. Scan new QR code when prompted

### Cause 4: WA_SERVICE_SKIP_INIT Set Incorrectly

**Symptoms:**
- `messageListenerCount: 0` in health check
- Log says "message listeners will not be attached"

**Solutions:**
```bash
# Check environment
env | grep WA_SERVICE_SKIP_INIT

# If set to "true", remove it or set to "false"
unset WA_SERVICE_SKIP_INIT
# or in .env file:
WA_SERVICE_SKIP_INIT=false

# Restart application
pm2 restart cicero
```

### Cause 5: WhatsApp Number on Multiple Devices

**Symptoms:**
- Client connects but messages not received
- Works intermittently

**Solutions:**
- WhatsApp allows max 4 linked devices
- Check Linked Devices on phone and remove unused ones
- Ensure only one instance of your bot is running

## Enable Debug Logging

For detailed troubleshooting, enable debug logging:

```bash
# In .env file or environment
export WA_DEBUG_LOGGING=true

# Restart application
pm2 restart cicero
```

This will show detailed message flow logs including:
- Message deduplication
- Contact metadata fetching
- Every step of message processing

**Note:** Disable in production as it generates high log volume.

## Quick Checklist

- [ ] Application is running
- [ ] Chrome/Chromium is installed and accessible
- [ ] QR code was scanned (if new session)
- [ ] Health check shows `ready: true` for all clients
- [ ] Health check shows `messageListenerCount: 1` or higher
- [ ] No fatal init errors in health check
- [ ] `WA_SERVICE_SKIP_INIT` is NOT set to "true"
- [ ] Only one bot instance is running
- [ ] Phone has internet connection
- [ ] Less than 4 devices linked to WhatsApp number

## Still Not Working?

If you've checked all of the above and messages still don't appear in logs:

1. Collect diagnostic information:
   ```bash
   # Health check
   curl http://localhost:3000/api/health/wa > wa-health.json
   
   # Recent logs
   pm2 logs cicero --lines 200 > wa-logs.txt
   
   # Environment
   env | grep WA_ > wa-env.txt
   ```

2. Look for the CRITICAL diagnostic log:
   ```
   [WWEBJS-ADAPTER] *** MESSAGE EVENT TRIGGERED ***
   ```
   - If you see this → Event relay issue
   - If you don't see this → Connection/authentication issue

3. Create GitHub issue with:
   - Output from health endpoint
   - Last 200 lines of logs
   - Environment variables (sanitized)
   - Steps to reproduce

## References

- `/api/health/wa` - Health check endpoint
- `scripts/test-wa-setup.js` - Test WhatsApp setup
- `scripts/diagnose-wa-listeners.js` - Diagnose listeners
- `docs/wa_message_fix_guide.md` - Previous message reception fixes
- `docs/wa_troubleshooting.md` - General WhatsApp troubleshooting
