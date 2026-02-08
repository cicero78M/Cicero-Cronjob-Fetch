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

The adapter monitors connection errors for "Bad MAC" patterns in:
- Error messages containing "Bad MAC"
- Stack traces containing "Bad MAC"

### Recovery Process

1. **First Error**: Log the error and increment counter (1/3)
2. **Second Error**: Log the error and increment counter (2/3)
3. **Third Error**: Trigger automatic session recovery
   - Log warning about too many consecutive errors
   - Clear the corrupted session data
   - Reinitialize the WhatsApp connection with fresh keys
   - Reset the error counter

### Counter Reset

The error counter resets to 0 when:
- The connection successfully opens (connection state = 'open')
- Session recovery completes successfully

This prevents false positives from temporary network issues.

## Configuration

### Error Threshold

The default threshold is 3 consecutive Bad MAC errors. This is defined as:

```javascript
const MAX_CONSECUTIVE_MAC_ERRORS = 3;
```

This threshold balances between:
- **Too low (1-2)**: May trigger unnecessary session resets from temporary issues
- **Too high (5+)**: Takes longer to recover from genuine session corruption

### Session Clear

When recovery is triggered, the adapter automatically clears the session by:
- Removing the `~/.cicero/baileys_auth/{clientId}` directory
- Creating a fresh authentication directory
- Reconnecting and re-authenticating with WhatsApp

## Monitoring

### Log Messages

**Detection:**
```
[BAILEYS] Bad MAC error detected (1/3): Bad MAC Error: Bad MAC
[BAILEYS] Bad MAC error detected (2/3): Bad MAC Error: Bad MAC
```

**Recovery Triggered:**
```
[BAILEYS] Bad MAC error detected (3/3): Bad MAC Error: Bad MAC
[BAILEYS] Too many consecutive Bad MAC errors (3), reinitializing with session clear
[BAILEYS] Reinitializing clientId=wa-gateway after bad-mac-error (3 consecutive MAC failures) (clear session).
[BAILEYS] Cleared auth session for clientId=wa-gateway at /path/to/session.
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
- **Event Handler**: `sock.ev.on('connection.update')`

### Error Detection Logic

```javascript
// Check for Bad MAC and session errors
if (lastDisconnect?.error) {
  const error = lastDisconnect.error;
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || '';
  
  // Detect Bad MAC errors from libsignal - be specific to avoid false positives
  const isBadMacError = errorMessage.includes('Bad MAC') || 
                       errorStack.includes('Bad MAC');
  
  if (isBadMacError) {
    consecutiveMacErrors++;
    console.error(
      `[BAILEYS] Bad MAC error detected (${consecutiveMacErrors}/${MAX_CONSECUTIVE_MAC_ERRORS}):`,
      errorMessage
    );
    
    // After threshold, reinitialize with session clear
    if (consecutiveMacErrors >= MAX_CONSECUTIVE_MAC_ERRORS && !reinitInProgress) {
      await reinitializeClient(
        'bad-mac-error',
        `${MAX_CONSECUTIVE_MAC_ERRORS} consecutive MAC failures`,
        { clearAuthSessionOverride: true }
      );
      
      // Reset counter only after reinit is triggered
      consecutiveMacErrors = 0;
    }
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
