# Bad MAC Error Handling Guide

## Overview

The Baileys WhatsApp adapter now includes automatic recovery for "Bad MAC" (Message Authentication Code) errors that occur during message decryption.

## Problem

When WhatsApp messages are encrypted, they use cryptographic keys to ensure message integrity. A "Bad MAC" error occurs when:

1. **Session Key Corruption**: The local session keys become corrupted or out of sync with WhatsApp servers
2. **Key Mismatch**: The decryption keys don't match what the sender used to encrypt the message
3. **Protocol Version Mismatch**: The message was encrypted with a different protocol version than expected

These errors typically manifest in the logs as:

```
Session error:Error: Bad MAC Error: Bad MAC
    at Object.verifyMAC (/path/to/node_modules/libsignal/src/crypto.js:87:15)
    at SessionCipher.doDecryptWhisperMessage
    at async SessionCipher.decryptWithSessions
```

## Solution

The Baileys adapter now automatically detects and recovers from Bad MAC errors:

### Detection

The adapter monitors for "Bad MAC" patterns in **three locations** (prioritized by detection order):

1. **Logger-level errors** (NEW - Primary Detection): During libsignal/Baileys decryption
   - Intercepts error-level logs from the Baileys library using Pino hooks
   - Catches "Bad MAC" and "Failed to decrypt" messages
   - Earliest possible detection - catches errors at the decryption layer
   - Fastest response to session corruption issues

2. **Connection-level errors**: During connection updates and disconnections
   - Error messages containing "Bad MAC"
   - Stack traces containing "Bad MAC"
   - Secondary detection if errors cause connection issues

3. **Message-level errors**: During message transformation
   - Logs any errors that occur while processing received messages
   - Tertiary detection for edge cases

### Recovery Process

1. **First Error**: Log the error and increment counter (1/2)
2. **Second Error**: 
   - If within 5 seconds of first error: Trigger immediate recovery (rapid error detection)
   - Otherwise: Trigger recovery at threshold
   - Log warning about too many consecutive errors
   - Clear the corrupted session data
   - Reinitialize the WhatsApp connection with fresh keys
   - Reset the error counter

### Counter Reset

The error counter resets to 0 when:
- The connection successfully opens (connection state = 'open')
- Session recovery completes successfully
- More than 60 seconds pass without any Bad MAC errors (timeout reset)

This prevents false positives from temporary network issues and ensures the counter only tracks truly consecutive errors.

## Configuration

### Error Threshold

The default threshold is 2 consecutive Bad MAC errors (reduced from 3 for faster recovery). This is defined as:

```javascript
const MAX_CONSECUTIVE_MAC_ERRORS = 2;
```

Additionally, the system detects **rapid errors** (errors occurring within 5 seconds) and can trigger recovery even after just 1 error if it's part of a rapid sequence, as this indicates serious session corruption.

This threshold balances between:
- **Too low (1)**: May trigger unnecessary session resets from single transient issues
- **Too high (3+)**: Takes longer to recover from genuine session corruption
- **Current (2 with rapid detection)**: Fast recovery while avoiding false positives

### Session Clear

When recovery is triggered, the adapter automatically clears the session by:
- Removing the `~/.cicero/baileys_auth/{clientId}` directory
- Creating a fresh authentication directory
- Reconnecting and re-authenticating with WhatsApp

## Monitoring

### Log Messages

**Detection at Logger Level (NEW - Primary):**
```
[BAILEYS] Bad MAC error detected in decryption layer (1/2): Failed to decrypt message with any known session
[BAILEYS] Bad MAC error detected in decryption layer (2/2) [RAPID]: Bad MAC Error: Bad MAC
[BAILEYS] Too many Bad MAC errors detected, scheduling reinitialization (reason: Rapid Bad MAC errors in decryption (0s between errors))
```

**Detection at Connection Level (Secondary):**
```
[BAILEYS] Bad MAC error detected (1/2): Bad MAC Error: Bad MAC
[BAILEYS] Bad MAC error detected (2/2) [RAPID]: Bad MAC Error: Bad MAC
```

**Detection at Message Level (Tertiary):**
```
[BAILEYS] Error processing message: Bad MAC Error: Bad MAC from 6281234567890@s.whatsapp.net
```

**Recovery Triggered:**
```
[BAILEYS] Bad MAC error detected (2/2): Bad MAC Error: Bad MAC
[BAILEYS] Too many Bad MAC errors, reinitializing with session clear (reason: 2 consecutive MAC failures)
[BAILEYS] Reinitializing clientId=wa-gateway after bad-mac-error (2 consecutive MAC failures) (clear session).
[BAILEYS] Cleared auth session for clientId=wa-gateway at /path/to/session.
```

Or for rapid errors:
```
[BAILEYS] Bad MAC error detected (1/2) [RAPID]: Bad MAC Error: Bad MAC
[BAILEYS] Too many Bad MAC errors, reinitializing with session clear (reason: Rapid Bad MAC errors (0s between errors))
```

**Successful Recovery:**
```
[BAILEYS] Connection opened successfully
```

### Metrics to Monitor

1. **Frequency of Bad MAC errors**: Should be rare (< 1% of connections)
2. **Recovery success rate**: Should be high (> 95%)
3. **Time to recovery**: Should complete within 30 seconds
4. **Error patterns**: Check if errors occur at specific times or under certain conditions

## Troubleshooting

### Persistent Bad MAC Errors

If Bad MAC errors continue after recovery:

1. **Check WhatsApp Mobile App**
   - Ensure the WhatsApp mobile app is connected and working
   - Verify the linked devices show the correct device

2. **Network Issues**
   - Check for unstable network connections
   - Verify firewall rules allow WhatsApp protocol
   - Check for proxy or VPN interference

3. **System Time**
   - Ensure system time is synchronized (NTP)
   - Bad timestamps can cause crypto verification failures

4. **Multiple Instances**
   - Ensure only one instance uses the same session directory
   - Multiple instances sharing sessions will cause key conflicts

### Manual Recovery

If automatic recovery fails, manually clear the session:

```bash
# Stop the application
pm2 stop cicero_v2

# Clear the session
rm -rf ~/.cicero/baileys_auth/wa-gateway

# Restart the application
pm2 start cicero_v2

# Scan the QR code when prompted
```

### Prevent Bad MAC Errors

1. **Use Stable Network**: Ensure consistent network connectivity
2. **Avoid Session Sharing**: Each client should have its own unique session
3. **Regular Updates**: Keep Baileys library updated
4. **Monitor Session Health**: Check for session warnings in logs

## Technical Details

### Implementation Location

- **File**: `src/service/baileysAdapter.js`
- **Function**: `createBaileysClient()`
- **Primary Detection**: Pino logger `hooks.logMethod` (lines 88-141)
- **Secondary Detection**: `sock.ev.on('connection.update')` event handler
- **Tertiary Detection**: `sock.ev.on('messages.upsert')` error catch block

### Error Detection Logic

**Primary Detection (Logger Level):**
```javascript
// Custom Pino logger that intercepts error messages
const logger = P({
  level: debugLoggingEnabled ? 'debug' : 'error',
  timestamp: debugLoggingEnabled,
  hooks: {
    logMethod(inputArgs, method, level) {
      // Intercept error-level logs to detect Bad MAC errors
      if (level >= 50) { // 50 = error level in Pino
        const firstArg = inputArgs[0];
        let errorText = '';
        
        if (typeof firstArg === 'string') {
          errorText = firstArg;
        } else if (firstArg && typeof firstArg === 'object') {
          errorText = firstArg.msg || firstArg.message || firstArg.err?.message || '';
        }
        
        // Check for Bad MAC errors (case-insensitive)
        const lowerText = errorText.toLowerCase();
        if (lowerText.includes('bad mac') || lowerText.includes('failed to decrypt')) {
          // Handle Bad MAC error asynchronously
          setImmediate(() => handleBadMacError(errorText));
        }
      }
      
      // Continue with normal logging only if debug is enabled
      if (debugLoggingEnabled) {
        return method.apply(this, inputArgs);
      }
    }
  }
});

const handleBadMacError = (errorMsg) => {
  const now = Date.now();
  const timeSinceLastError = lastMacErrorTime > 0 ? now - lastMacErrorTime : 0;
  
  // Reset counter if too much time has passed
  if (timeSinceLastError > MAC_ERROR_RESET_TIMEOUT) {
    consecutiveMacErrors = 0;
  }
  
  consecutiveMacErrors++;
  lastMacErrorTime = now;
  
  const isRapidError = timeSinceLastError > 0 && timeSinceLastError < MAC_ERROR_RAPID_THRESHOLD;
  
  // Trigger recovery if threshold reached or rapid errors detected
  const shouldRecover = consecutiveMacErrors >= MAX_CONSECUTIVE_MAC_ERRORS || 
                       (isRapidError && consecutiveMacErrors >= 1);
  
  if (shouldRecover && !reinitInProgress) {
    // Schedule reinitialization asynchronously
    setImmediate(async () => {
      if (!reinitInProgress) {
        await reinitializeClient(
          'bad-mac-error-decryption',
          reason,
          { clearAuthSessionOverride: true }
        );
        consecutiveMacErrors = 0;
        lastMacErrorTime = 0;
      }
    });
  }
};
```

**Secondary Detection (Connection Level):**
```javascript
// Check for Bad MAC and session errors during connection updates
if (lastDisconnect?.error) {
  const isBadMacError = errorMessage.includes('Bad MAC') || 
                       errorStack.includes('Bad MAC');
  
  if (isBadMacError) {
    // Same recovery logic as logger-level detection
  }
}
```

## Testing

The Bad MAC error handling is covered by automated tests:

```bash
# Run Baileys adapter tests
npm test -- tests/baileysAdapter.test.js

# Expected: All 11 tests pass, including:
# - baileys adapter handles Bad MAC errors
# - baileys adapter resets MAC error counter on successful connection
```

## References

- [Baileys Library](https://github.com/WhiskeySockets/Baileys)
- [libsignal Protocol](https://signal.org/docs/)
- [WhatsApp Encryption Overview](https://www.whatsapp.com/security/)

## Support

If you encounter persistent Bad MAC errors:

1. Check this guide's troubleshooting section
2. Review application logs for error patterns
3. Verify network and system configuration
4. Consider manual session reset if automatic recovery fails
