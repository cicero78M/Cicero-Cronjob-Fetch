# WhatsApp Bot Ready Event Fix

## Problem Description

### Symptom
The WhatsApp bot reads and responds to messages during initial startup, but after the first initialization cycle, it stops reading any messages and does not respond to anything sent via WhatsApp. Users receive the "🤖 Bot sedang memuat, silakan tunggu" (Bot is loading, please wait) message indefinitely.

### When It Occurs
- After client reinitialization due to authentication failures
- After disconnect/reconnect events  
- After any event that triggers `reinitializeClient()` in the wwebjs adapter
- Essentially: works once on startup, fails on all subsequent reconnections

## Root Cause

### The Bug
The ready event handlers in `waService.js` were registered using `.once("ready")` instead of `.on("ready")`:

```javascript
// BEFORE (BUGGY):
waClient.once("ready", () => {
  clearAuthenticatedFallbackTimer(waClient);
  clearLogoutAwaitingQr(waClient);
  markClientReady(waClient, "ready");
});
```

### Why This Caused the Issue

1. **Initial Startup:**
   - WhatsApp client connects and emits 'ready' event
   - Handler registered with `.once()` executes
   - Handler immediately removes itself (`.once()` behavior)
   - Client marked as ready ✅
   - Messages processed normally ✅

2. **After Reinitialization:**
   - Client reinitializes (auth failure, disconnect, etc.)
   - Adapter destroys old client and creates new one
   - New client connects and emits 'ready' event
   - Handler no longer attached (was removed after first call) ❌
   - `markClientReady()` never called ❌
   - Client remains in "not ready" state forever ❌
   - All messages deferred indefinitely ❌

### Architecture Context

The WhatsApp integration has two layers:
1. **wwebjsAdapter.js** - Wraps whatsapp-web.js client
   - Creates an `emitter` (EventEmitter)
   - Attaches internal handlers to underlying WhatsApp client
   - Re-emits events from client to emitter
   - Internal handlers use `.on()` correctly

2. **waService.js** - Business logic layer
   - Receives emitter from adapter
   - Attaches external handlers to emitter ONCE at module load
   - Handlers persist across reconnections (emitter never recreated)
   - **BUG WAS HERE:** Used `.once()` which only fires once total

## The Fix

### Changes Made
Changed three event handler registrations from `.once("ready")` to `.on("ready")`:

**File:** `src/service/waService.js`

**Line 1584** - waClient (main admin bot):
```javascript
// AFTER (FIXED):
waClient.on("ready", () => {
  clearAuthenticatedFallbackTimer(waClient);
  clearLogoutAwaitingQr(waClient);
  markClientReady(waClient, "ready");
});
```

**Line 1629** - waUserClient (user-facing bot):
```javascript
waUserClient.on("ready", () => {
  clearAuthenticatedFallbackTimer(waUserClient);
  clearLogoutAwaitingQr(waUserClient);
  markClientReady(waUserClient, "ready");
});
```

**Line 1673** - waGatewayClient (gateway bot):
```javascript
waGatewayClient.on("ready", () => {
  clearAuthenticatedFallbackTimer(waGatewayClient);
  clearLogoutAwaitingQr(waGatewayClient);
  markClientReady(waGatewayClient, "ready");
});
```

### Why This Fix Is Safe

1. **Idempotent Handler:**
   ```javascript
   function markClientReady(client, src = "unknown") {
     const state = getClientReadinessState(client);
     if (!state.ready) {  // ← Prevents duplicate processing
       state.ready = true;
       console.log(`[${state.label}] READY via ${src}`);
       // ... rest of handler
     }
   }
   ```

2. **No Memory Leak:**
   - Handlers attached ONCE at module load time
   - Never re-attached during reconnections
   - Emitter object persists (never recreated)
   - Only internal handlers in adapter are removed/re-added

3. **Consistent with Adapter:**
   - Adapter's internal handlers already use `.on()`
   - This fix aligns waService.js with adapter pattern

## Testing

### Unit Tests
All WhatsApp-related tests pass:
- ✅ wwebjsAdapter.test.js: 5/5 tests
- ✅ waEventAggregator.test.js: 2/2 tests
- ✅ No new test failures introduced

### Linting
- ✅ ESLint: No errors or warnings

### Security
- ✅ CodeQL: 0 vulnerabilities found

### Manual Testing Procedure

1. **Start the application:**
   ```bash
   npm start
   ```

2. **Verify initial connection:**
   - Wait for log: `[WA] READY via ready`
   - Send test message to bot
   - ✅ Bot should respond

3. **Simulate reinitialization:**
   - Trigger disconnect (kill WhatsApp connection)
   - Or wait for auth failure event
   - Watch logs for reinitialization

4. **Verify reconnection:**
   - Wait for log: `[WA] READY via ready` (should appear again)
   - Send test message to bot
   - ✅ Bot should still respond (THIS IS THE FIX)

### Debug Logging

Enable verbose logging to trace the issue:
```bash
export WA_DEBUG_LOGGING=true
npm start
```

Expected log sequence on reconnection:
```
[WWEBJS] Reinitializing clientId=wa-admin after auth_failure
[WWEBJS] Client wa-admin ready, stores initialized
[WWEBJS-ADAPTER] Emitting 'ready' event for clientId=wa-admin
[WA] READY via ready  ← This log should appear on EVERY reconnection
[WA] Incoming message from 628xxx...
```

## Deployment

### Prerequisites
- None (no config changes, no migrations)

### Steps
1. Deploy updated code
2. Restart application
3. Monitor logs for ready events
4. Test message sending/receiving

### Rollback Plan
If issues occur:
```bash
git revert <commit-hash>
pm2 restart cicero_v2
```

## Monitoring

### Success Indicators
- Log `[WA] READY via ready` appears after every reconnection
- No "Bot sedang memuat" messages after reconnection
- Messages processed normally after auth failures/disconnects

### Failure Indicators
- Only one `[WA] READY via ready` log (on startup)
- Persistent "Bot sedang memuat" messages
- Messages deferred indefinitely in logs

### Health Check
```bash
curl http://localhost:<PORT>/wa-health | jq '.clients[] | {label, ready, messageListenerCount}'
```

Expected output after fix:
```json
{
  "label": "WA",
  "ready": true,
  "messageListenerCount": 1  // Should always be 1+
}
```

## Related Issues

### Similar Issues
This fix addresses the same class of problem as the previous fix documented in:
- `docs/wa_message_fix_guide.md` - Message listeners being removed
- `docs/wa_troubleshooting.md` - General WA troubleshooting

### Prevention
When adding event handlers to WhatsApp clients:
1. ✅ Use `.on()` for events that should fire multiple times
2. ✅ Use `.once()` ONLY for truly one-time events
3. ✅ Consider reinitialization scenarios
4. ✅ Test reconnection behavior

## References

- **PR:** `copilot/debug-wa-bot-read-issue`
- **Issue:** WhatsApp bot stops reading after ready event
- **Files Changed:** `src/service/waService.js` (3 lines)
- **Date:** 2026-02-02

## Support

If the bot still doesn't respond after reconnection:

1. **Check logs for ready events:**
   ```bash
   grep "READY via" logs/*.log
   ```

2. **Verify handlers are attached:**
   ```bash
   curl http://localhost:<PORT>/wa-health | jq '.clients[].messageListenerCount'
   ```
   Should be > 0 for all clients

3. **Enable debug logging:**
   ```bash
   export WA_DEBUG_LOGGING=true
   ```

4. **Check for other issues:**
   - See `docs/wa_troubleshooting.md`
   - Check `WA_SERVICE_SKIP_INIT` not set to "true"
   - Verify Chrome/Chromium installed
   - Check session authentication status
