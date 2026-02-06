import { jest } from '@jest/globals';

const respondComplaintMessageMock = jest.fn();
const parseComplaintMessageMock = jest.fn((message) => {
  const nrpMatch = /NRP\s*[:：]\s*(\d+)/i.exec(message || '');
  const hasKendala = /\bkendala\b/i.test(message || '');
  return {
    raw: message,
    nrp: nrpMatch ? nrpMatch[1] : '',
    issues: hasKendala ? ['dummy issue'] : [],
  };
});

jest.unstable_mockModule('../src/handler/menu/clientRequestHandlers.js', () => ({
  clientRequestHandlers: {
    respondComplaint_message: respondComplaintMessageMock,
    main: jest.fn(),
  },
  parseComplaintMessage: parseComplaintMessageMock,
}));

jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  normalizeUserId: jest.fn((value) =>
    value === undefined || value === null ? '' : String(value).replace(/\D/g, '')
  ),
}));

const {
  handleComplaintMessageIfApplicable,
  shouldHandleComplaintMessage,
} = await import('../src/service/waAutoComplaintService.js');

describe('waAutoComplaintService', () => {
  const originalGatewayAdmin = process.env.GATEWAY_WHATSAPP_ADMIN;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalGatewayAdmin === undefined) {
      delete process.env.GATEWAY_WHATSAPP_ADMIN;
    } else {
      process.env.GATEWAY_WHATSAPP_ADMIN = originalGatewayAdmin;
    }
  });

  test('should handle complaint message and invoke responder', async () => {
    const chatId = 'admin-chat';
    const adminOptionSessions = {
      [chatId]: { timeout: setTimeout(() => {}, 1000) },
    };
    const sessions = new Map();
    const setSession = (id, data) => {
      sessions.set(id, { ...data, time: Date.now() });
    };
    const getSession = (id) => sessions.get(id);

    const complaintMessage = [
      'Pesan Komplain',
      'NRP    : 12345',
      '',
      'Kendala',
      '- Sudah melaksanakan Instagram belum terdata.',
    ].join('\n');

    const handled = await handleComplaintMessageIfApplicable({
      text: complaintMessage,
      allowUserMenu: false,
      session: null,
      isAdmin: true,
      initialIsMyContact: true,
      chatId,
      adminOptionSessions,
      setSession,
      getSession,
      waClient: {},
      pool: {},
      userModel: {},
    });

    expect(handled).toBe(true);
    expect(respondComplaintMessageMock).toHaveBeenCalledTimes(1);
    expect(respondComplaintMessageMock.mock.calls[0][0]).toMatchObject({
      menu: 'clientrequest',
      step: 'respondComplaint_message',
      respondComplaint: {},
    });
    expect(adminOptionSessions[chatId]).toBeUndefined();
    expect(getSession(chatId)).toMatchObject({ menu: 'clientrequest' });
  });

  test('allows structured complaints from unregistered WhatsApp senders', async () => {
    const chatId = 'public-chat';
    const adminOptionSessions = {};
    const sessions = new Map();
    const setSession = (id, data) => {
      sessions.set(id, { ...data, time: Date.now() });
    };
    const getSession = (id) => sessions.get(id);

    const complaintMessage = [
      'Pesan Komplain',
      'NRP    : 99999',
      '',
      'Kendala',
      '- Akses dashboard terkunci.',
    ].join('\n');

    const handled = await handleComplaintMessageIfApplicable({
      text: complaintMessage,
      allowUserMenu: false,
      session: null,
      isAdmin: false,
      initialIsMyContact: false,
      senderId: '62001234@c.us',
      chatId,
      adminOptionSessions,
      setSession,
      getSession,
      waClient: {},
      pool: {},
      userModel: {},
    });

    expect(handled).toBe(true);
    expect(respondComplaintMessageMock).toHaveBeenCalledTimes(1);
    expect(getSession(chatId)).toMatchObject({ menu: 'clientrequest' });
  });

  test('accepts complaints with a preamble before the header', () => {
    const complaintMessage = [
      'Mohon dibantu untuk laporan berikut.',
      'Pesan Komplain',
      'NRP    : 12345',
      '',
      'Kendala',
      '- Data belum masuk.',
    ].join('\n');

    const result = shouldHandleComplaintMessage({
      text: complaintMessage,
      allowUserMenu: false,
      session: null,
      isAdmin: true,
      initialIsMyContact: true,
    });

    expect(result).toBe(true);
  });

  test('should not handle when header or verification is missing', async () => {
    const result = shouldHandleComplaintMessage({
      text: 'Pesan Biasa',
      allowUserMenu: false,
      session: null,
      isAdmin: true,
      initialIsMyContact: true,
    });
    expect(result).toBe(false);

    const handled = await handleComplaintMessageIfApplicable({
      text: 'Pesan Biasa',
      allowUserMenu: false,
      session: null,
      isAdmin: false,
      initialIsMyContact: false,
      chatId: 'chat',
      adminOptionSessions: {},
      setSession: jest.fn(),
      getSession: jest.fn(),
      waClient: {},
      pool: {},
      userModel: {},
    });
    expect(handled).toBe(false);
    expect(respondComplaintMessageMock).not.toHaveBeenCalled();
  });

  test('skips gateway-forwarded complaints when relayed between gateways', async () => {
    process.env.GATEWAY_WHATSAPP_ADMIN = '6200002,6200003';
    const adminOptionSessions = {};
    const sessions = new Map();
    const setSession = (id, data) => {
      sessions.set(id, { ...data, time: Date.now() });
    };
    const getSession = (id) => sessions.get(id);

    const complaintMessage = [
      'Pesan Komplain',
      'NRP : 98765',
      'Kendala: tidak bisa login',
    ].join('\n');

    const firstHandled = await handleComplaintMessageIfApplicable({
      text: complaintMessage,
      allowUserMenu: false,
      session: null,
      isAdmin: false,
      initialIsMyContact: true,
      senderId: '6200111@c.us',
      chatId: 'chat-a',
      adminOptionSessions,
      setSession,
      getSession,
      waClient: {},
      pool: {},
      userModel: {},
    });

    const secondHandled = await handleComplaintMessageIfApplicable({
      text: `wagateway forward\n${complaintMessage}`,
      allowUserMenu: false,
      session: null,
      isAdmin: false,
      initialIsMyContact: true,
      senderId: '6200002@s.whatsapp.net',
      chatId: 'chat-b',
      adminOptionSessions,
      setSession,
      getSession,
      waClient: {},
      pool: {},
      userModel: {},
    });

    expect(firstHandled).toBe(true);
    expect(secondHandled).toBe(false);
    expect(respondComplaintMessageMock).toHaveBeenCalledTimes(1);
  });
});
