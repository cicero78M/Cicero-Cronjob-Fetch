import { jest } from '@jest/globals';

// Mock event emitter for Baileys socket
const mockSocketEvents = {};
const mockSocket = {
  ev: {
    on: jest.fn((event, handler) => {
      if (!mockSocketEvents[event]) {
        mockSocketEvents[event] = [];
      }
      mockSocketEvents[event].push(handler);
    }),
    off: jest.fn(),
  },
  user: undefined,
  sendMessage: jest.fn().mockResolvedValue({ key: { id: 'test-msg-id' } }),
  onWhatsApp: jest.fn().mockResolvedValue([{ exists: true, jid: '123@s.whatsapp.net' }]),
  readMessages: jest.fn().mockResolvedValue(),
  end: jest.fn(),
};

// Mock Baileys
jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  default: jest.fn(() => mockSocket),
  DisconnectReason: {
    badSession: 401,
    connectionClosed: 428,
    connectionLost: 408,
    connectionReplaced: 440,
    loggedOut: 401,
    restartRequired: 515,
    timedOut: 408,
  },
  useMultiFileAuthState: jest.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: jest.fn(),
  }),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({
    version: [2, 2412, 54],
    isLatest: true,
  }),
  makeCacheableSignalKeyStore: jest.fn().mockReturnValue({}),
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', 'Chrome', '20.0.04']),
  },
}));

// Mock Pino logger
jest.unstable_mockModule('pino', () => ({
  default: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const { createBaileysClient } = await import('../src/service/baileysAdapter.js');

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockSocketEvents).forEach(key => delete mockSocketEvents[key]);
  mockSocket.user = undefined;
  delete process.env.WA_DEBUG_LOGGING;
  delete process.env.WA_AUTH_DATA_PATH;
});

let activeClients = [];

afterEach(async () => {
  // Clean up all active clients
  for (const client of activeClients) {
    await client.disconnect();
  }
  activeClients = [];
});

test('baileys adapter initializes and connects', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  expect(client).toBeDefined();
  expect(client.clientId).toBe('test-client');
  
  await client.connect();
  
  // Trigger connection.update with open state
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  // Verify ready event was emitted
  const readyHandler = jest.fn();
  client.on('ready', readyHandler);
  
  // Trigger ready again
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  expect(readyHandler).toHaveBeenCalled();
});

test('baileys adapter relays messages', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  const onMessage = jest.fn();
  client.onMessage(onMessage);
  
  await client.connect();
  
  // Trigger connection open
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  // Simulate incoming message
  const incomingMsg = {
    key: {
      remoteJid: '123@s.whatsapp.net',
      id: 'msg-123',
      fromMe: false,
    },
    message: {
      conversation: 'Hello',
    },
    messageTimestamp: Date.now(),
  };
  
  if (mockSocketEvents['messages.upsert']) {
    mockSocketEvents['messages.upsert'].forEach(handler => 
      handler({ messages: [incomingMsg], type: 'notify' })
    );
  }
  
  expect(onMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      from: '123@s.whatsapp.net',
      body: 'Hello',
    })
  );
});

test('baileys adapter sends messages', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  // Trigger connection open
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  const messageId = await client.sendMessage('123@s.whatsapp.net', 'Hello');
  
  expect(mockSocket.sendMessage).toHaveBeenCalledWith(
    '123@s.whatsapp.net',
    { text: 'Hello' }
  );
  expect(messageId).toBe('test-msg-id');
});

test('baileys adapter sends documents', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  // Trigger connection open
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  const buffer = Buffer.from('test file content');
  await client.sendMessage('123@s.whatsapp.net', {
    document: buffer,
    mimetype: 'text/plain',
    fileName: 'test.txt',
  });
  
  expect(mockSocket.sendMessage).toHaveBeenCalledWith(
    '123@s.whatsapp.net',
    expect.objectContaining({
      document: buffer,
      mimetype: 'text/plain',
      fileName: 'test.txt',
    })
  );
});

test('baileys adapter handles QR code events', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  const qrHandler = jest.fn();
  client.on('qr', qrHandler);
  
  await client.connect();
  
  // Simulate QR code event
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ qr: 'test-qr-code' })
    );
  }
  
  expect(qrHandler).toHaveBeenCalledWith('test-qr-code');
});

test('baileys adapter handles disconnection', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  const disconnectHandler = jest.fn();
  client.onDisconnect(disconnectHandler);
  
  await client.connect();
  
  // Simulate disconnection
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  expect(disconnectHandler).toHaveBeenCalledWith('CONNECTION_CLOSED');
});

test('baileys adapter can be disconnected', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  await client.disconnect();
  
  expect(mockSocket.end).toHaveBeenCalled();
});

test('baileys adapter checks number registration', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  const result = await client.getNumberId('+1234567890');
  
  expect(mockSocket.onWhatsApp).toHaveBeenCalledWith('+1234567890');
  expect(result).toBe('123@s.whatsapp.net');
});

test('baileys adapter gets client state', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  
  // Before connection
  let state = await client.getState();
  expect(state).toBe('DISCONNECTED');
  
  await client.connect();
  
  // After connection but before ready
  state = await client.getState();
  expect(state).toBe('OPENING');
  
  // Simulate connection ready
  mockSocket.user = { id: '123@s.whatsapp.net' };
  state = await client.getState();
  expect(state).toBe('CONNECTED');
});

test('baileys adapter handles Bad MAC errors', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  // Spy on console methods to verify error logging
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  
  // Simulate first Bad MAC error
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            message: 'Bad MAC Error: Bad MAC',
            stack: 'Error: Bad MAC\n    at verifyMAC\n    at doDecryptWhisperMessage',
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  // First MAC error should be logged but not trigger reinit
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Bad MAC error detected (1/3)'),
    expect.stringContaining('Bad MAC')
  );
  
  // Simulate second Bad MAC error
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            message: 'Error: Bad MAC',
            stack: 'Error: Bad MAC\n    at Object.verifyMAC\n    at SessionCipher',
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  // Second MAC error should increment counter
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Bad MAC error detected (2/3)'),
    expect.stringContaining('Bad MAC')
  );
  
  // Simulate third Bad MAC error
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            message: 'Bad MAC Error: Bad MAC',
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  // Third MAC error should trigger warning about reinit
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Bad MAC error detected (3/3)'),
    expect.anything()
  );
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Too many consecutive Bad MAC errors (3)'),
  );
  
  // Cleanup
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

test('baileys adapter resets MAC error counter on successful connection', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  await client.connect();
  
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  
  // Simulate first Bad MAC error
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            message: 'Bad MAC Error: Bad MAC',
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Bad MAC error detected (1/3)'),
    expect.anything()
  );
  
  // Simulate successful connection (should reset counter)
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ connection: 'open' })
    );
  }
  
  // Simulate another Bad MAC error (should start from 1 again)
  if (mockSocketEvents['connection.update']) {
    mockSocketEvents['connection.update'].forEach(handler => 
      handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            message: 'Bad MAC Error: Bad MAC',
            output: { statusCode: 428 }
          }
        }
      })
    );
  }
  
  // Counter should have reset, so this should be (1/3) not (2/3)
  const errorCalls = consoleErrorSpy.mock.calls.filter(
    call => call[0] && call[0].includes('[BAILEYS] Bad MAC error detected')
  );
  
  // Should have two calls: first at (1/3), second at (1/3) after reset
  expect(errorCalls.length).toBe(2);
  expect(errorCalls[1][0]).toContain('(1/3)');
  
  consoleErrorSpy.mockRestore();
});

test('baileys adapter reinitializes with cleared session on LOGGED_OUT', async () => {
  const client = await createBaileysClient('test-client');
  activeClients.push(client);
  
  const qrHandler = jest.fn();
  client.on('qr', qrHandler);
  
  await client.connect();
  
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  
  // Simulate LOGGED_OUT disconnect (statusCode: 401)
  // We need to ensure the handlers are called and awaited properly
  const handlerPromises = [];
  if (mockSocketEvents['connection.update']) {
    for (const handler of mockSocketEvents['connection.update']) {
      const result = handler({ 
        connection: 'close',
        lastDisconnect: {
          error: {
            output: { statusCode: 401 } // DisconnectReason.loggedOut
          }
        }
      });
      // If handler returns a promise, wait for it
      if (result && typeof result.then === 'function') {
        handlerPromises.push(result);
      }
    }
  }
  
  // Wait for all async operations from handlers
  await Promise.all(handlerPromises);
  
  // Should log that it's reinitializing after logout
  expect(consoleLogSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Logged out detected, reinitializing with cleared session...')
  );
  
  // Should reinitialize with session clear
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    expect.stringContaining('[BAILEYS] Reinitializing clientId=test-client after logged-out (User logged out) (clear session)')
  );
  
  // Should clear the auth session (this appears in a different console.warn call with "at" appended)
  const clearedSessionCall = consoleWarnSpy.mock.calls.find(
    call => call[0] && call[0].includes('[BAILEYS] Cleared auth session for clientId=test-client')
  );
  expect(clearedSessionCall).toBeDefined();
  
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});
