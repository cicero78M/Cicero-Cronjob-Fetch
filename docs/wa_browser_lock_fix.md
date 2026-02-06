# WhatsApp Browser Lock Recovery Fix

## Problem

The WhatsApp Web.js integration was experiencing a critical issue during browser lock recovery:

```
[WWEBJS] Applying unique userDataDir fallback for clientId=wa-gateway-prod after 2 lock failures.
[WWEBJS] initialize retry failed after browser lock recovery for clientId=wa-gateway-prod (connect:attempt-2): 
LocalAuth is not compatible with a user-supplied userDataDir.
[WA-GATEWAY] Initialization failed (hard failure): LocalAuth is not compatible with a user-supplied userDataDir.
```

### Root Cause

When multiple browser lock failures occurred (detected via Chromium's singleton lock files), the system attempted to apply a fallback authentication data path to avoid conflicts with existing browser instances. However, the implementation incorrectly modified the `dataPath` property of an existing `LocalAuth` strategy instance:

```javascript
// OLD CODE (BUGGY)
const authStrategy = client.authStrategy || client.options?.authStrategy || null;
if (authStrategy && 'dataPath' in authStrategy) {
  authStrategy.dataPath = nextPath;  // ❌ This causes incompatibility
}
```

This approach caused a conflict because:
1. `LocalAuth` in whatsapp-web.js manages its own session directory structure
2. Modifying `dataPath` after client creation created a mismatch between:
   - What `LocalAuth` expected (its original path)
   - What Puppeteer was using (the modified path)
3. whatsapp-web.js detects this mismatch and throws: "LocalAuth is not compatible with a user-supplied userDataDir"

## Solution

Instead of modifying the `LocalAuth` strategy's `dataPath` after client creation, we now properly update Puppeteer's `userDataDir` option:

```javascript
// NEW CODE (FIXED)
// Update Puppeteer userDataDir instead of modifying LocalAuth dataPath
// to avoid "LocalAuth is not compatible with a user-supplied userDataDir" error
const sessionPath = buildSessionPath(nextPath, clientId);
if (!client.options) {
  console.error(
    `[WWEBJS] Cannot apply fallback auth data path for clientId=${clientId} because ` +
      'client.options is undefined. This indicates an unexpected client state. Fallback aborted.'
  );
  return false;
}
if (!client.options.puppeteer) {
  client.options.puppeteer = {};
}
client.options.puppeteer.userDataDir = sessionPath;  // ✅ Proper way to redirect profile
emitter.sessionPath = sessionPath;
```

### Why This Works

1. **LocalAuth stays unchanged**: The `LocalAuth` strategy maintains its original configuration without conflicts
2. **Puppeteer redirects properly**: By setting `userDataDir` in Puppeteer options, we tell Chromium where to store its profile data
3. **No incompatibility**: There's no mismatch between LocalAuth and Puppeteer's expectations
4. **Fallback works correctly**: Browser locks are resolved by using a unique profile directory

## Technical Details

### Browser Lock Detection Flow

1. Client attempts to initialize
2. If Chromium detects singleton lock files (`SingletonLock`, `SingletonSocket`, `SingletonCookie`), it throws "browser is already running"
3. System detects active browser lock and increments `lockActiveFailureCount`
4. When `lockActiveFailureCount >= lockFallbackThreshold` (default: 2), fallback is triggered
5. A unique fallback path is generated: `{base}_{clientId}_{hostname}_{pid}_attempt{N}`
6. **NEW**: Puppeteer's `userDataDir` is set to the fallback path
7. Initialization retry succeeds with the new profile directory

### Files Modified

- `src/service/wwebjsAdapter.js` - `applyAuthDataPath` function (lines 907-939)

### Configuration

The following environment variables control browser lock behavior:

- `WA_WWEBJS_LOCK_FALLBACK_THRESHOLD` - Number of lock failures before applying fallback (default: 2)
- `WA_WWEBJS_FALLBACK_AUTH_DATA_PATH` - Base path for fallback directories (optional)
- `WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX` - Custom suffix for fallback directories (optional)
- `WA_WWEBJS_LOCK_RECOVERY_STRICT` - If "true", fail immediately on active locks instead of falling back

## Testing

### Manual Testing

1. Start the application
2. Trigger a browser lock condition by running two instances simultaneously
3. Observe logs for:
   ```
   [WWEBJS] Detected browser lock for clientId=wa-gateway-prod
   [WWEBJS] Applying unique userDataDir fallback for clientId=wa-gateway-prod after 2 lock failures
   [WWEBJS] Using fallback auth data path for clientId=wa-gateway-prod (lock active fallback attempt 1): /path/to/fallback (userDataDir=/path/to/fallback/session-wa-gateway-prod)
   ```
4. Verify initialization completes successfully without "LocalAuth is not compatible" error

### Automated Testing

Run the wwebjsAdapter test suite:
```bash
npm test tests/wwebjsAdapter.test.js
```

## Impact

- **Before**: Browser lock recovery caused cascading initialization failures
- **After**: Browser lock recovery works correctly, allowing WhatsApp clients to initialize with fallback profiles
- **No Breaking Changes**: Existing functionality remains unchanged for normal operation paths

## Related Documentation

- `docs/wa_troubleshooting.md` - WhatsApp troubleshooting guide
- `docs/whatsapp_client_lifecycle.md` - WhatsApp client lifecycle documentation
- `src/service/wwebjsAdapter.js` - WhatsApp Web.js adapter implementation
