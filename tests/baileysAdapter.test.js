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
    version: [2, 3000, 0],
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
