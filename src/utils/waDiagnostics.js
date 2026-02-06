/**
 * WhatsApp Service Diagnostics Utility
 * Helps diagnose message reception issues
 */

export function logWaServiceDiagnostics(
  waClient,
  waUserClient,
  waGatewayClient,
  readinessSummary = null
) {
  const clients = [
    { name: 'waClient', label: 'WA', client: waClient },
    { name: 'waUserClient', label: 'WA-USER', client: waUserClient },
    { name: 'waGatewayClient', label: 'WA-GATEWAY', client: waGatewayClient },
  ];
  const readinessByLabel = new Map(
    readinessSummary?.clients?.map((entry) => [entry.label, entry]) || []
  );
  const missingChromeHint =
    'Hint: set WA_PUPPETEER_EXECUTABLE_PATH or run "npx puppeteer browsers install chrome".';

  console.log('\n========== WA SERVICE DIAGNOSTICS ==========');
  console.log(`WA_SERVICE_SKIP_INIT: ${process.env.WA_SERVICE_SKIP_INIT || 'not set'}`);
  console.log(`Should Init Clients: ${process.env.WA_SERVICE_SKIP_INIT !== 'true'}`);

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
    
    // Check if message listeners are attached
    if (client && typeof client.listenerCount === 'function') {
      console.log(`  'message' listener count: ${client.listenerCount('message')}`);
      console.log(`  'ready' listener count: ${client.listenerCount('ready')}`);
      console.log(`  'qr' listener count: ${client.listenerCount('qr')}`);
    }
  });

  console.log('\n===========================================\n');
}

export function checkMessageListenersAttached(waClient, waUserClient, waGatewayClient) {
  const clients = [
    { name: 'waClient', client: waClient },
    { name: 'waUserClient', client: waUserClient },
    { name: 'waGatewayClient', client: waGatewayClient },
  ];

  let allGood = true;
  clients.forEach(({ name, client }) => {
    if (!client) {
      console.error(`[WA DIAGNOSTICS] ${name} is not defined!`);
      allGood = false;
      return;
    }

    if (typeof client.listenerCount !== 'function') {
      console.warn(`[WA DIAGNOSTICS] ${name} does not have listenerCount method`);
      return;
    }

    const messageListeners = client.listenerCount('message');
    if (messageListeners === 0) {
      console.error(`[WA DIAGNOSTICS] ${name} has NO 'message' event listeners attached!`);
      console.error(`[WA DIAGNOSTICS] This means messages will NOT be received by this client.`);
      console.error(`[WA DIAGNOSTICS] Check if WA_SERVICE_SKIP_INIT is set to 'true'`);
      allGood = false;
    } else {
      console.log(`[WA DIAGNOSTICS] ✓ ${name} has ${messageListeners} 'message' listener(s)`);
    }
  });

  if (!allGood) {
    console.error('\n[WA DIAGNOSTICS] ⚠️  MESSAGE RECEPTION ISSUE DETECTED!');
    console.error('[WA DIAGNOSTICS] The WhatsApp bot will NOT be able to receive messages.');
    console.error('[WA DIAGNOSTICS] Please check your environment configuration.\n');
  } else {
    console.log('\n[WA DIAGNOSTICS] ✓ All message listeners are properly attached.\n');
  }

  return allGood;
}
