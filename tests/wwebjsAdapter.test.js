import { jest } from '@jest/globals';

const listeners = {};
const mockClient = {
  on: jest.fn((event, handler) => {
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(handler);
  }),
  removeListener: jest.fn((event, handler) => {
    if (listeners[event]) {
      const index = listeners[event].indexOf(handler);
      if (index > -1) {
        listeners[event].splice(index, 1);
      }
    }
  }),
  removeAllListeners: jest.fn((event) => {
    if (event) {
      delete listeners[event];
    } else {
      Object.keys(listeners).forEach(key => delete listeners[key]);
    }
  }),
  initialize: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  sendMessage: jest.fn().mockResolvedValue({ id: { id: 'abc' } }),
  getState: jest.fn().mockResolvedValue('CONNECTED'),
  info: {},
};

const MessageMedia = jest.fn();
const ClientMock = jest.fn(() => mockClient);
const LocalAuthMock = jest.fn().mockImplementation(() => ({}));

jest.unstable_mockModule('whatsapp-web.js', () => ({
  default: {
    Client: ClientMock,
    LocalAuth: LocalAuthMock,
    MessageMedia,
  },
}));

const { createWwebjsClient } = await import('../src/service/wwebjsAdapter.js');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WA_WEB_VERSION;
  delete process.env.WA_WEB_VERSION_CACHE_URL;
});

test('wwebjs adapter relays messages', async () => {
  const client = await createWwebjsClient();
  const onMessage = jest.fn();
  client.onMessage(onMessage);
  await client.connect();
  const incoming = { from: '123', body: 'hi', id: { id: 'm1', _serialized: 'm1' } };
  // Trigger all message listeners
  if (listeners['message']) {
    listeners['message'].forEach(handler => handler(incoming));
  }
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(incoming));
  const id = await client.sendMessage('123', 'hello');
  expect(id).toBe('abc');
  expect(mockClient.sendMessage).toHaveBeenCalledWith('123', 'hello', {
    sendSeen: false,
  });
  await client.disconnect();
  expect(mockClient.destroy).toHaveBeenCalled();
});

test('wwebjs adapter configures web version cache and overrides', async () => {
  process.env.WA_WEB_VERSION_CACHE_URL = 'https://example.com/wa.json';
  process.env.WA_WEB_VERSION = '2.3000.0';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ version: '2.3000.0' }),
  });

  await createWwebjsClient('custom-client');

  expect(ClientMock).toHaveBeenCalledWith(
    expect.objectContaining({
      authStrategy: expect.anything(),
      puppeteer: expect.objectContaining({
        args: ['--no-sandbox'],
        headless: true,
      }),
      webVersionCache: { type: 'remote', remotePath: 'https://example.com/wa.json' },
      webVersion: '2.3000.0',
    })
  );
  expect(LocalAuthMock).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'custom-client' })
  );
});

test('wwebjs adapter sends documents as MessageMedia', async () => {
  MessageMedia.mockImplementation(function (mimetype, data, filename) {
    this.mimetype = mimetype;
    this.data = data;
    this.filename = filename;
  });
  const client = await createWwebjsClient();
  await client.connect();
  const buffer = Buffer.from('file');
  await client.sendMessage('123', {
    document: buffer,
    mimetype: 'text/plain',
    fileName: 'file.txt',
  });
  expect(MessageMedia).toHaveBeenCalledWith(
    'text/plain',
    buffer.toString('base64'),
    'file.txt'
  );
  const mediaInstance = MessageMedia.mock.instances[0];
  expect(mockClient.sendMessage).toHaveBeenCalledWith('123', mediaInstance, {
    sendMediaAsDocument: true,
    sendSeen: false,
  });
});

test('wwebjs adapter re-registers event listeners after reinitialization', async () => {
  const client = await createWwebjsClient('test-reinit');
  const onMessage = jest.fn();
  client.onMessage(onMessage);
  await client.connect();
  
  // Verify initial message handling works
  const incoming1 = { from: '123', body: 'first', id: { id: 'm1', _serialized: 'm1' } };
  if (listeners['message']) {
    listeners['message'].forEach(handler => handler(incoming1));
  }
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(incoming1));
  
  // Count initial listeners
  const initialMessageListenerCount = listeners['message']?.length || 0;
  
  // Reinitialize the client
  jest.clearAllMocks();
  await client.reinitialize({ trigger: 'test' });
  
  // Verify that removeListener was called (not removeAllListeners for message event)
  // QR events should still use removeAllListeners
  expect(mockClient.removeAllListeners).toHaveBeenCalledWith('qr');
  // Other events should use removeListener
  expect(mockClient.removeListener).toHaveBeenCalled();
  
  // The on() calls should have been made again for re-registration
  const onCallsAfterReinit = mockClient.on.mock.calls;
  const messageListenerAdded = onCallsAfterReinit.some(call => call[0] === 'message');
  expect(messageListenerAdded).toBe(true);
  
  // Verify we still have the same number of message listeners (internal listener was removed and re-added)
  const finalMessageListenerCount = listeners['message']?.length || 0;
  expect(finalMessageListenerCount).toBe(initialMessageListenerCount);
  
  // Verify message handling still works after reinitialization
  const incoming2 = { from: '456', body: 'second', id: { id: 'm2', _serialized: 'm2' } };
  if (listeners['message']) {
    listeners['message'].forEach(handler => handler(incoming2));
  }
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(incoming2));
});

test('wwebjs adapter preserves external message listeners during reinitialization', async () => {
  const client = await createWwebjsClient('test-external-listeners');
  const adapterOnMessage = jest.fn();
  const externalOnMessage = jest.fn();
  
  // Attach adapter's message handler
  client.onMessage(adapterOnMessage);
  await client.connect();
  
  // Simulate external listener attachment (like waService.js does)
  mockClient.on('message', externalOnMessage);
  
  // Count listeners before reinitialization
  const listenerCountBefore = listeners['message']?.length || 0;
  
  // Verify initial message handling works for both handlers
  const incoming1 = { from: '123', body: 'before', id: { id: 'm1', _serialized: 'm1' } };
  if (listeners['message']) {
    listeners['message'].forEach(handler => handler(incoming1));
  }
  expect(adapterOnMessage).toHaveBeenCalledWith(expect.objectContaining(incoming1));
  expect(externalOnMessage).toHaveBeenCalledWith(incoming1);
  
  // Reinitialize the client
  jest.clearAllMocks();
  await client.reinitialize({ trigger: 'test' });
  
  // Count listeners after reinitialization
  const listenerCountAfter = listeners['message']?.length || 0;
  
  // External listener should still be present
  expect(listenerCountAfter).toBe(listenerCountBefore);
  
  // Verify both handlers still work after reinitialization
  const incoming2 = { from: '456', body: 'after', id: { id: 'm2', _serialized: 'm2' } };
  if (listeners['message']) {
    listeners['message'].forEach(handler => handler(incoming2));
  }
  expect(adapterOnMessage).toHaveBeenCalledWith(expect.objectContaining(incoming2));
  expect(externalOnMessage).toHaveBeenCalledWith(incoming2);
});
