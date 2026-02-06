# Fix: GroupMetadata Not Available Issue

## Problem Description
The system was logging "[WWEBJS] getChat skipped: GroupMetadata not available" errors repeatedly, and message processing appeared to be blocked or not logging properly when messages were received, especially for group chats.

## Root Cause
The WhatsApp Web.js client emits the 'ready' event before all internal stores are fully initialized. Specifically, the `GroupMetadata` store (required for group chat operations) may not be available immediately when the 'ready' event fires.

When messages arrive (especially for group chats), the message handler attempts to call `sendSeen()`, which internally requires the `GroupMetadata` store. If this store isn't ready, the operation fails with a warning and returns early, potentially causing confusion about whether messages are being processed.

## Solution
The fix improves the robustness of store initialization checking with the following changes:

### 1. Enhanced `ensureWidFactory` Function
- **Added retry logic**: The function now accepts a `retryAttempts` parameter (default: 1)
- **Incremental backoff**: Each retry waits progressively longer (attempt * 1000ms)
- **Reduced noise**: Warning logs only appear on the final retry attempt
- **Debug logging**: When `WA_DEBUG_LOGGING=true`, shows retry progress

### 2. Updated 'ready' Event Handler
- **Waits for WidFactory**: Uses 3 retry attempts to ensure WidFactory is available
- **Configurable delay**: Waits for stores to initialize (configurable via `WA_STORE_INIT_DELAY_MS`, default: 2000ms)
- **Debug confirmation**: Logs when stores are fully initialized (when debug logging enabled)
- **Can be disabled**: Set `WA_STORE_INIT_DELAY_MS=0` to skip the initialization delay

### 3. Configured Retry Attempts for Operations
Different operations now use appropriate retry counts:
- **Group chats (`getChat`)**: 3 attempts (more critical, needs GroupMetadata)
- **Individual chats (`getChat`)**: 2 attempts (less critical)
- **`sendSeen`**: 2 attempts with reduced warning noise
- **`getNumberId`**: 2 attempts

### 4. Graceful Degradation
- `sendSeen` now only logs warnings when debug logging is enabled if stores aren't ready
- Message processing continues even if `sendSeen` fails
- Operations return `null` or `false` gracefully when stores aren't ready

## Benefits
1. **Reduced errors**: Fewer "GroupMetadata not available" warnings
2. **Better initialization**: Stores have more time to become ready
3. **Clearer logs**: Warning messages only appear when truly necessary
4. **Continued processing**: Message handling doesn't block waiting for stores

## Testing Recommendations
1. Test with group chat messages to verify no more "GroupMetadata not available" errors
2. Test with individual chat messages to ensure backward compatibility
3. Verify message logs appear correctly with timestamps
4. Check that `sendSeen` works for both group and individual chats
5. Enable `WA_DEBUG_LOGGING=true` to see detailed retry progress

## Configuration
The following environment variables can be used for configuration and debugging:
```bash
WA_DEBUG_LOGGING=true          # Enable detailed logging of retry attempts and store initialization
WA_STORE_INIT_DELAY_MS=2000   # Delay in ms to wait for stores after 'ready' event (default: 2000, set to 0 to disable)
```

## Files Modified
- `src/service/wwebjsAdapter.js`: Enhanced store readiness checking with retry logic
