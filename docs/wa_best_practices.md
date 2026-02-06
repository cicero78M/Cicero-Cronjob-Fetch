# WhatsApp Bot Best Practices Guide - Cicero V2

## Overview

This guide documents best practices for WhatsApp bot message reception and processing in the Cicero V2 system, based on deep investigation of the wwebjs workflow mechanism.

## Architecture Overview

### Message Flow

```
WhatsApp Web.js Client
    ↓
Internal Message Handler (wwebjsAdapter.js)
    ↓
Event Emitter ('message' event)
    ↓
External Listeners (waService.js)
    ↓
Message Deduplication (waEventAggregator.js)
    ↓
Handler Functions (handleMessage, handleUserMessage, handleGatewayMessage)
    ↓
Business Logic Processing
```

### Key Components

1. **wwebjsAdapter.js**: WhatsApp Web.js client wrapper
   - Manages client lifecycle (connect, ready, disconnect)
   - Registers internal event handlers
   - Emits events to external listeners
   - Handles reinitialization without losing external listeners

2. **waService.js**: Main WhatsApp service
   - Creates and manages three clients (waClient, waUserClient, waGatewayClient)
   - Attaches external message listeners
   - Routes messages to appropriate handlers
   - Manages readiness state and deferred messages

3. **waEventAggregator.js**: Message deduplication
   - Prevents duplicate message processing
   - Handles multiple adapter sources (wwebjs, baileys)
   - TTL-based cache to prevent memory leaks
   - Automatic cleanup of expired entries

## Best Practices

### 1. Memory Management ✅

**DO**:
- Use TTL-based caching for temporary data
- Implement periodic cleanup for caches
- Monitor cache sizes via health endpoints
- Set appropriate TTL based on use case

**DON'T**:
- Use unbounded Sets or Maps for long-running processes
- Store data indefinitely without cleanup
- Ignore memory metrics in production

**Example**:
```javascript
// GOOD: TTL-based cache with cleanup
const cache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of cache.entries()) {
    if (now - timestamp > TTL) {
      cache.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

// BAD: Unbounded cache
const cache = new Set();
cache.add(item); // Never removed!
```

### 2. Event Listener Management ✅

**DO**:
- Store references to internal event handlers
- Use `removeListener(event, handler)` instead of `removeAllListeners(event)`
- Preserve external listeners during reinitialization
- Test listener preservation in unit tests

**DON'T**:
- Use `removeAllListeners()` when external listeners exist
- Forget to store handler references for cleanup
- Assume all listeners are internal

**Example**:
```javascript
// GOOD: Preserves external listeners
let internalHandler = null;

const registerListeners = () => {
  if (internalHandler) {
    client.removeListener('message', internalHandler);
  }
  internalHandler = (msg) => { /* handle */ };
  client.on('message', internalHandler);
};

// BAD: Removes ALL listeners including external ones
client.removeAllListeners('message'); // ⚠️ Dangerous!
```

### 3. Error Handling ✅

**DO**:
- Wrap async operations in try-catch
- Log errors with context (jid, id, adapter)
- Continue processing even if one message fails
- Use Promise.catch() for handler errors

**DON'T**:
- Let errors crash the entire service
- Ignore error context
- Fail silently without logging

**Example**:
```javascript
// GOOD: Robust error handling
const invokeHandler = () =>
  Promise.resolve(handler(msg)).catch((error) => {
    console.error("[WA] handler error", {
      jid: msg.from,
      id: msg.id,
      fromAdapter,
      error,
    });
  });

// BAD: Unhandled errors
handler(msg); // Can crash if handler throws
```

### 4. Configuration Management ✅

**DO**:
- Provide sensible defaults
- Validate environment variables
- Document all configuration options
- Fail fast on invalid configuration

**DON'T**:
- Assume environment variables are always valid
- Use magic numbers in code
- Skip input validation

**Example**:
```javascript
// GOOD: Validated configuration
function parseConfig() {
  const envValue = process.env.CONFIG_VALUE;
  if (!envValue) return DEFAULT_VALUE;
  
  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < MIN_VALUE) {
    console.warn(`Invalid CONFIG_VALUE="${envValue}", using default`);
    return DEFAULT_VALUE;
  }
  return parsed;
}

// BAD: No validation
const config = parseInt(process.env.CONFIG_VALUE); // NaN if invalid!
```

### 5. Debug Logging ✅

**DO**:
- Gate debug logs behind environment variable
- Include context in log messages (jid, id, adapter)
- Log at appropriate levels (debug, info, warn, error)
- Provide troubleshooting visibility

**DON'T**:
- Log everything by default (log spam)
- Log without context
- Forget to disable debug logs in production

**Example**:
```javascript
// GOOD: Conditional debug logging
const debugEnabled = process.env.WA_DEBUG_LOGGING === 'true';

if (debugEnabled) {
  console.log(`[WA] Processing message from ${msg.from}`);
}

// Always log warnings/errors
console.warn(`[WA] Unexpected condition: ${details}`);

// BAD: Always logging
console.log(`Processing ${msg.from}`); // Log spam!
```

### 6. Monitoring & Observability ✅

**DO**:
- Expose health check endpoints
- Include metrics in health checks
- Track cache sizes, rates, and errors
- Monitor trends over time

**DON'T**:
- Deploy without monitoring
- Ignore metric trends
- Skip health check validation

**Example**:
```javascript
// GOOD: Health endpoint with metrics
app.get('/health/wa', (req, res) => {
  res.json({
    status: 'ok',
    clients: getClientStatus(),
    deduplication: getCacheStats(),
    uptime: process.uptime(),
  });
});

// BAD: No observability
// No way to check system state
```

### 7. Testing Strategy ✅

**DO**:
- Test message flow end-to-end
- Test error conditions
- Test reinitialization scenarios
- Test listener preservation
- Use mocks for external dependencies

**DON'T**:
- Only test happy path
- Skip edge cases
- Forget to test cleanup logic

**Example**:
```javascript
// GOOD: Comprehensive test
test('preserves external listeners during reinit', async () => {
  const client = await createClient();
  const externalHandler = jest.fn();
  
  // Attach external listener
  client.on('message', externalHandler);
  
  // Trigger reinitialization
  await client.reinitialize();
  
  // Emit message
  // Should still call external handler
  expect(externalHandler).toHaveBeenCalled();
});
```

### 8. Resource Cleanup ✅

**DO**:
- Use `timer.unref()` for periodic tasks
- Clean up on process exit if needed
- Prevent memory leaks from timers
- Close connections properly

**DON'T**:
- Let timers prevent process exit
- Forget to cleanup resources
- Create resource leaks

**Example**:
```javascript
// GOOD: Doesn't prevent exit
const timer = setInterval(cleanup, INTERVAL);
if (timer.unref) {
  timer.unref();
}

// BAD: Blocks exit
setInterval(cleanup, INTERVAL); // Process won't exit!
```

## Common Issues & Solutions

### Issue 1: Messages Not Being Received

**Symptoms**:
- Bot doesn't respond to messages
- No logs showing message reception
- Users report bot is offline

**Diagnosis**:
1. Check `WA_SERVICE_SKIP_INIT` environment variable
   ```bash
   echo $WA_SERVICE_SKIP_INIT
   # Should be unset or "false"
   ```

2. Check health endpoint:
   ```bash
   curl http://localhost:3000/api/health/wa | jq
   ```

3. Verify listener attachment in logs:
   ```
   [WA] Attaching message event listeners...
   [WA] Message event listeners attached successfully.
   [WA DIAGNOSTICS] ✓ waClient has 1 'message' listener(s)
   ```

**Solution**:
- Ensure `WA_SERVICE_SKIP_INIT` is not set to "true"
- Verify clients are initialized (`shouldInitWhatsAppClients: true`)
- Check client readiness state
- Enable debug logging: `WA_DEBUG_LOGGING=true`

### Issue 2: Memory Growth Over Time

**Symptoms**:
- Server memory increases continuously
- No obvious memory leak in application code
- Cache sizes keep growing

**Diagnosis**:
1. Check deduplication cache size:
   ```bash
   curl http://localhost:3000/api/health/wa | jq .messageDeduplication
   ```

2. Monitor cache size trend over 24+ hours

3. Check if cleanup is running (enable debug logging)

**Solution**:
- Verify TTL-based cache is in use (post-fix)
- Adjust `WA_MESSAGE_DEDUP_TTL_MS` if needed
- Check for other unbounded caches in code
- Monitor with memory profiler

### Issue 3: Duplicate Message Processing

**Symptoms**:
- Users receive duplicate responses
- Same message processed multiple times
- Logs show duplicate message IDs

**Diagnosis**:
1. Enable debug logging to see deduplication flow:
   ```bash
   WA_DEBUG_LOGGING=true
   ```

2. Check for messages without IDs:
   ```
   [WA-EVENT-AGGREGATOR] Message missing identifier
   ```

3. Verify deduplication cache is working

**Solution**:
- Ensure message IDs are present
- Check if `allowReplay` is being set incorrectly
- Verify cache TTL is not too short
- Check for race conditions in message handling

### Issue 4: Client Reinitialization Loop

**Symptoms**:
- Client keeps reinitializing
- Logs show repeated "Reinitializing clientId=" messages
- Bot is intermittently available

**Diagnosis**:
1. Check for authentication failures
2. Review disconnect reasons in logs
3. Check Chrome/Chromium availability
4. Verify session data integrity

**Solution**:
- Scan QR code if needed
- Check `WA_AUTH_DATA_PATH` permissions
- Verify Chrome installation
- Review session clearing settings

## Configuration Reference

### Environment Variables

```bash
# === Core Configuration ===

# Skip WhatsApp initialization (testing only, NEVER in production)
WA_SERVICE_SKIP_INIT=false

# Enable verbose debug logging (disable in production)
WA_DEBUG_LOGGING=false

# Message deduplication TTL (default: 24 hours)
WA_MESSAGE_DEDUP_TTL_MS=86400000

# === Client Configuration ===

# User request client ID
USER_WA_CLIENT_ID=wa-userrequest-prod

# Gateway client ID
GATEWAY_WA_CLIENT_ID=wa-gateway-prod

# === Session Management ===

# Custom auth data path (optional)
WA_AUTH_DATA_PATH=

# Clear session on reinitialization
WA_AUTH_CLEAR_SESSION_ON_REINIT=false

# === Browser Configuration ===

# Web version cache URL
WA_WEB_VERSION_CACHE_URL=https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json

# Pin specific WhatsApp Web version (optional)
WA_WEB_VERSION=

# === Timeout Configuration ===

# Protocol timeout for main client (default: 120 seconds)
WA_WWEBJS_PROTOCOL_TIMEOUT_MS=120000

# Protocol timeout for user client
WA_WWEBJS_PROTOCOL_TIMEOUT_MS_USER=120000

# Protocol timeout for gateway client (longer for group operations)
WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY=180000

# Maximum protocol timeout (for backoff)
WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS=300000

# Timeout backoff multiplier
WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER=1.5
```

### Default Values

| Setting | Default | Min | Max | Description |
|---------|---------|-----|-----|-------------|
| `WA_MESSAGE_DEDUP_TTL_MS` | 86400000 (24h) | 60000 (1m) | - | Message cache TTL |
| `WA_WWEBJS_PROTOCOL_TIMEOUT_MS` | 120000 (2m) | - | 300000 | Protocol timeout |
| `WA_STORE_INIT_DELAY_MS` | 2000 | 0 | - | Store init delay |

## Monitoring Checklist

### Startup
- [ ] "Attaching message event listeners" log appears
- [ ] All clients show listener count > 0
- [ ] Clients reach ready state within timeout
- [ ] No authentication failures

### Runtime
- [ ] Messages are processed (check logs with debug enabled)
- [ ] Cache size stabilizes at expected volume
- [ ] No memory growth over time
- [ ] Cleanup runs every hour (if debug enabled)
- [ ] No unexpected reinitialization loops

### Health Check
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
      "label": "waClient",
      "messageListenerCount": 1,
      "readyListenerCount": 1,
      "state": "ready"
    }
  ],
  "messageDeduplication": {
    "cacheSize": 150,
    "ttlMs": 86400000,
    "oldestEntryAgeMs": 3600000,
    "ttlHours": 24
  }
}
```

## Deployment Checklist

### Pre-Deployment
- [ ] Review and update environment variables
- [ ] Verify `WA_SERVICE_SKIP_INIT` is not "true"
- [ ] Verify `WA_DEBUG_LOGGING` is not "true" (unless troubleshooting)
- [ ] Run tests: `npm test`
- [ ] Run linter: `npm run lint`
- [ ] Review configuration documentation

### Deployment
- [ ] Deploy updated code
- [ ] Restart application/service
- [ ] Verify clients initialize successfully
- [ ] Check startup logs for errors
- [ ] Verify health endpoint responds

### Post-Deployment
- [ ] Send test messages to verify reception
- [ ] Monitor health endpoint metrics
- [ ] Check cache size trend over 24 hours
- [ ] Verify memory usage is stable
- [ ] Monitor for any errors in logs

## Performance Considerations

### Message Processing
- **Throughput**: Designed for 100s of messages/second
- **Latency**: Sub-millisecond deduplication check
- **Memory**: ~100 bytes per cached message
- **Cleanup**: O(n) every hour, negligible CPU impact

### Cache Sizing
```
Estimated Cache Size = (Messages per Day) × (TTL in Days)

Example: 10,000 messages/day × 1 day = 10,000 entries
Memory: 10,000 × 100 bytes = ~1 MB
```

Adjust TTL based on:
- Message volume
- Available memory
- Duplicate risk tolerance

## Security Considerations

### Authentication
- Session data stored locally in `WA_AUTH_DATA_PATH`
- QR code shown only on first initialization
- Session persists between restarts
- Use `WA_AUTH_CLEAR_SESSION_ON_REINIT=true` to force re-auth

### Access Control
- Admin WhatsApp numbers: `ADMIN_WHATSAPP`
- Gateway admin numbers: `GATEWAY_WHATSAPP_ADMIN`
- Client operator numbers: `CLIENT_OPERATOR`

### Data Privacy
- Messages are processed in memory, not persisted by default
- Deduplication cache stores only message IDs (jid:id)
- Automatic cleanup after TTL expiry
- No message content stored in cache

## Troubleshooting Tools

### 1. Debug Logging
```bash
WA_DEBUG_LOGGING=true npm start
```

Shows detailed message flow:
```
[WWEBJS-ADAPTER] Raw message received
[WWEBJS-ADAPTER] Emitting 'message' event
[WA-SERVICE] waClient received message
[WA-EVENT-AGGREGATOR] Message received from adapter
[WA-EVENT-AGGREGATOR] Processing wwebjs message
```

### 2. Health Endpoint
```bash
# Full health check
curl http://localhost:3000/api/health/wa | jq

# Just deduplication stats
curl http://localhost:3000/api/health/wa | jq .messageDeduplication

# Monitor cache size
watch -n 60 'curl -s http://localhost:3000/api/health/wa | jq .messageDeduplication.cacheSize'
```

### 3. Test Script
```bash
node scripts/test-wa-setup.js
```

### 4. Diagnostics
Check listener attachment:
```javascript
import { checkMessageListenersAttached } from './src/utils/waDiagnostics.js';
checkMessageListenersAttached();
```

## References

### Documentation
- `docs/wa_memory_leak_fix.md` - Memory leak fix details
- `docs/wa_troubleshooting.md` - Troubleshooting guide
- `docs/wa_message_fix_guide.md` - Message reception fix
- `docs/whatsapp_client_lifecycle.md` - Client lifecycle
- `.env.example` - Configuration reference

### Code
- `src/service/wwebjsAdapter.js` - Client wrapper (1799 lines)
- `src/service/waService.js` - Main service (5421 lines)
- `src/service/waEventAggregator.js` - Deduplication (160 lines)
- `src/utils/waDiagnostics.js` - Diagnostic utilities

### Tests
- `tests/wwebjsAdapter.test.js` - Adapter tests
- `tests/waEventAggregator.test.js` - Deduplication tests

## Support

For issues or questions:
1. Check this best practices guide
2. Review troubleshooting documentation
3. Enable debug logging
4. Check health endpoint metrics
5. Review startup and runtime logs
6. Create GitHub issue with details if problem persists

## Version History

- **2024-02-02**: Initial best practices guide created
- **2024-02-02**: Added memory leak fix documentation
- **Previous**: Various fixes for message reception, listener preservation, store readiness
