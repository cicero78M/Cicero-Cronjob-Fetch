# Migration Guide: whatsapp-web.js to Baileys

## Overview

This document describes the migration from `whatsapp-web.js` to `@whiskeysockets/baileys` WhatsApp library.

## Why Migrate?

### Advantages of Baileys

1. **No Browser Dependency**: Baileys doesn't require Puppeteer/Chromium, making it lighter weight
2. **Native Multi-Device**: Better support for WhatsApp's multi-device protocol
3. **More Stable**: Fewer connection issues and better reconnection handling
4. **Better Performance**: Lower memory usage and faster initialization
5. **Active Development**: More actively maintained library

### Migration Benefits

- Reduced Docker image size (no need for Chrome/Chromium)
- Lower memory footprint
- More reliable connection handling
- Simpler authentication flow

## Breaking Changes

### Environment Variables Removed

The following environment variables are no longer used:
- `WA_WEB_VERSION_CACHE_URL`
- `WA_WEB_VERSION`
- `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY`
- `WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS`
- `WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER`

### New Environment Variables

- `WA_DEBUG_LOGGING` - Enable debug logging (default: false)
- `WA_BAILEYS_STRICT_SINGLE_OWNER` - Exit process immediately on `WA_BAILEYS_SHARED_SESSION_LOCK` conflict (default: false)

### Authentication Storage

#### Before (whatsapp-web.js)
- Auth data stored in: `~/.cicero/wwebjs_auth/{clientId}/`
- Browser profile stored separately
- Required Chromium/Puppeteer cache

#### After (Baileys)
- Auth data stored in: `~/.cicero/baileys_auth/{clientId}/`
- Multi-file auth state (creds.json, keys folder)
- No browser profile needed

### Session Lock Guard (`.session.lock`)

To prevent two processes from using the same Baileys auth directory at the same time,
the adapter now creates a lock file at:

- `~/.cicero/baileys_auth/{clientId}/.session.lock`

The lock stores minimal metadata:

- `pid`
- `hostname`
- `startedAt`
- `clientId`

Behavior summary:

1. Before `connect`, adapter checks and acquires `.session.lock`.
2. If lock belongs to a live process, adapter emits fatal log `WA_BAILEYS_SHARED_SESSION_LOCK` with lock owner + session path and stops initialization.
3. If lock PID is stale (process no longer alive), lock is cleaned up automatically.
4. Lock is released on `disconnect`, on reinitialize with session clear, and during `SIGINT`/`SIGTERM` shutdown handling.

### PM2 Single-Owner Checklist (Wajib)

Saat deploy dengan PM2, pastikan checklist ini terpenuhi:

- [ ] Jangan jalankan lebih dari satu process untuk `clientId` yang sama.
- [ ] Jangan share auth path antar service tanpa ownership yang jelas.
- [ ] Untuk mode fail-fast, set `WA_BAILEYS_STRICT_SINGLE_OWNER=true` agar proses langsung exit saat lock conflict.


## API Compatibility

The Baileys adapter maintains full API compatibility with the previous wwebjs adapter. No application code changes required.

### Supported Methods

All existing methods remain the same:

```javascript
// Connection
await client.connect()
await client.disconnect()
await client.reinitialize({ clearAuthSession: true })

// Messaging
await client.sendMessage(jid, 'Hello')
await client.sendMessage(jid, { 
  document: buffer, 
  mimetype: 'application/pdf',
  fileName: 'document.pdf'
})

// Events
client.on('qr', (qr) => { /* handle QR */ })
client.on('ready', () => { /* handle ready */ })
client.on('message', (msg) => { /* handle message */ })
client.on('disconnected', (reason) => { /* handle disconnect */ })

// Utilities
await client.getState()
await client.getNumberId(phone)
await client.isReady()
```

## Migration Steps

### 1. Update Dependencies

```bash
npm install
```

This will:
- Remove `whatsapp-web.js`
- Install `@whiskeysockets/baileys` and `pino`

### 2. Clear Old Auth Sessions (Optional)

If you want a fresh start:

```bash
rm -rf ~/.cicero/wwebjs_auth
```

### 3. Update Environment Variables

Remove the old wwebjs-specific variables from your `.env`:

```bash
# Remove these lines
WA_WEB_VERSION_CACHE_URL=...
WA_WEB_VERSION=...
WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY=...
```

Optionally add debug logging:

```bash
# Add this if you need debug logs
WA_DEBUG_LOGGING=false
```

### 4. First Connection

On first run, you'll need to scan the QR code again:

```bash
npm start
```

The QR code will be displayed in the terminal. Scan it with your WhatsApp mobile app.

### 5. Verify Connection

Check that the connection is successful:
- Look for `[BAILEYS] Connection opened successfully` in logs
- Verify that messages can be sent
- Check that the auth session is persisted in `~/.cicero/baileys_auth/{clientId}/`

## Troubleshooting

### Connection Issues

If you experience connection issues:

1. Clear auth session and reconnect:
   ```bash
   WA_AUTH_CLEAR_SESSION_ON_REINIT=true npm start
   ```

2. Check auth directory permissions:
   ```bash
   ls -la ~/.cicero/baileys_auth/
   ```

3. Enable debug logging:
   ```bash
   WA_DEBUG_LOGGING=true npm start
   ```

### QR Code Not Appearing

If QR code doesn't appear:
- Check that `WA_SERVICE_SKIP_INIT` is not set to `true`
- Verify that `GATEWAY_WA_CLIENT_ID` is properly configured
- Check for any error messages in logs

### Auth State Corruption

If auth state gets corrupted:

```bash
# Remove auth directory for specific client
rm -rf ~/.cicero/baileys_auth/wa-gateway-prod

# Restart and scan QR code again
npm start
```

## Rollback Procedure

If you need to rollback to whatsapp-web.js:

1. Restore previous package.json:
   ```bash
   git checkout HEAD~1 -- package.json
   npm install
   ```

2. Restore previous adapter files:
   ```bash
   git checkout HEAD~1 -- src/service/wwebjsAdapter.js
   git checkout HEAD~1 -- src/service/waService.js
   ```

3. Restore old environment variables in `.env`

4. Restart application

## Testing

Run the test suite to verify migration:

```bash
# Run all tests
npm test

# Run only Baileys adapter tests
npm test -- tests/baileysAdapter.test.js
```

## Performance Comparison

### Memory Usage

- **Before (wwebjs)**: ~400-600 MB (includes Chromium)
- **After (Baileys)**: ~100-150 MB

### Startup Time

- **Before (wwebjs)**: 15-30 seconds (browser initialization)
- **After (Baileys)**: 3-5 seconds

### Docker Image Size

- **Before (wwebjs)**: ~1.5 GB (includes Chromium dependencies)
- **After (Baileys)**: ~200 MB

## Support

If you encounter issues during migration:

1. Check this guide's troubleshooting section
2. Review the [Baileys documentation](https://github.com/WhiskeySockets/Baileys)
3. Check application logs with debug enabled
4. Open an issue in the repository with logs and error messages

## Additional Resources

- [Baileys GitHub Repository](https://github.com/WhiskeySockets/Baileys)
- [WhatsApp Multi-Device Documentation](https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts)
- [Project Documentation](./docs/)
