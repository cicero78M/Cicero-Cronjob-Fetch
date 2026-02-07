/**
 * WhatsApp Service Diagnostics Utility
 * Helps diagnose Gateway client issues
 */

export function logWaServiceDiagnostics(
  waGatewayClient,
  readinessSummary = null
) {
  const clients = [
    { name: 'waGatewayClient', label: 'WA-GATEWAY', client: waGatewayClient },
  ];
  const readinessByLabel = new Map(
    readinessSummary?.clients?.map((entry) => [entry.label, entry]) || []
  );
  const missingChromeHint =
    'Hint: set WA_PUPPETEER_EXECUTABLE_PATH or run "npx puppeteer browsers install chrome".';

  console.log('\n========== WA GATEWAY SERVICE DIAGNOSTICS ==========');
  console.log(`WA_SERVICE_SKIP_INIT: ${process.env.WA_SERVICE_SKIP_INIT || 'not set'}`);
  console.log(`Should Init Gateway Client: ${process.env.WA_SERVICE_SKIP_INIT !== 'true'}`);

  clients.forEach(({ name, label, client }) => {
    const readiness = readinessByLabel.get(label);
    console.log(`\n--- ${name} ---`);
    console.log(`  Client exists: ${!!client}`);
    console.log(`  Is EventEmitter: ${typeof client?.on === 'function'}`);
    console.log(`  Has connect method: ${typeof client?.connect === 'function'}`);
    console.log(`  Has sendMessage method: ${typeof client?.sendMessage === 'function'}`);
    if (readiness) {
      console.log(`  Readiness ready: ${readiness.ready}`);
      console.log(`  Readiness awaitingQrScan: ${readiness.awaitingQrScan}`);
      console.log(`  Readiness lastDisconnectReason: ${readiness.lastDisconnectReason || 'none'}`);
      console.log(`  Readiness lastAuthFailureAt: ${readiness.lastAuthFailureAt || 'none'}`);
      console.log(
        `  Readiness fatalInitError type: ${readiness.fatalInitError?.type || 'none'}`
      );
      if (readiness.fatalInitError?.type === 'missing-chrome') {
        console.log(`  ${missingChromeHint}`);
      }
      console.log(
        `  Readiness puppeteerExecutablePath: ${readiness.puppeteerExecutablePath || 'none'}`
      );
      console.log(`  Readiness sessionPath: ${readiness.sessionPath || 'none'}`);
    } else {
      console.log('  Readiness summary: unavailable');
    }
    
    // Check if the client has listeners attached
    if (client && typeof client.listenerCount === 'function') {
      console.log(`  'ready' listener count: ${client.listenerCount('ready')}`);
      console.log(`  'qr' listener count: ${client.listenerCount('qr')}`);
    }
  });

  console.log('\n====================================================\n');
}

export function checkGatewayClientAttached(waGatewayClient) {
  if (!waGatewayClient) {
    console.error('[WA DIAGNOSTICS] waGatewayClient is not defined!');
    return false;
  }

  if (typeof waGatewayClient.on !== 'function') {
    console.warn('[WA DIAGNOSTICS] waGatewayClient is not an EventEmitter');
    return false;
  }

  console.log('[WA DIAGNOSTICS] ✓ Gateway client is properly initialized\n');
  return true;
}

// Keep old function signature for backward compatibility but delegate to new function
export function checkMessageListenersAttached(waClient, waUserClient, waGatewayClient) {
  // Only check Gateway client now (removed fallback to waClient since it no longer exists)
  return checkGatewayClientAttached(waGatewayClient);
}
