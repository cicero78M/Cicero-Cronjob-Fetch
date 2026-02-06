import { jest } from '@jest/globals';

import clientRequestHandlers, {
  normalizeComplaintHandle,
  parseComplaintMessage,
  parseBulkStatusEntries,
} from '../../../src/handler/menu/clientRequestHandlers.js';
import * as tiktokPostModel from '../../../src/model/tiktokPostModel.js';
import * as tiktokCommentModel from '../../../src/model/tiktokCommentModel.js';
import * as satbinmasOfficialAccountService from '../../../src/service/satbinmasOfficialAccountService.js';

describe('normalizeComplaintHandle', () => {
  it('normalizes plain handles to lowercase with a leading @', () => {
    expect(normalizeComplaintHandle('ExampleUser')).toBe('@exampleuser');
    expect(normalizeComplaintHandle('@ExampleUser')).toBe('@exampleuser');
  });

  it('extracts usernames from Instagram profile URLs', () => {
    expect(
      normalizeComplaintHandle('https://www.instagram.com/Example.User/')
    ).toBe('@example.user');
    expect(
      normalizeComplaintHandle('instagram.com/u/AnotherPerson')
    ).toBe('@anotherperson');
  });

  it('extracts usernames from TikTok profile URLs', () => {
    expect(
      normalizeComplaintHandle('http://tiktok.com/@ExampleUser')
    ).toBe('@exampleuser');
    expect(
      normalizeComplaintHandle('https://www.tiktok.com/@ExampleUser/video/123')
    ).toBe('@exampleuser');
  });

  it('returns an empty string for unsupported URLs', () => {
    expect(normalizeComplaintHandle('https://instagram.com/p/ABC123')).toBe('');
    expect(normalizeComplaintHandle('')).toBe('');
  });
});

describe('parseComplaintMessage', () => {
  it('captures plain usernames correctly', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : exampleUser',
        'Username Tiktok : @TikTokUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@exampleuser');
    expect(parsed.tiktok).toBe('@tiktokuser');
  });

  it('captures handles shared as profile URLs', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : https://instagram.com/u/Example.User/',
        'Username Tiktok : https://www.tiktok.com/@AnotherUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@example.user');
    expect(parsed.tiktok).toBe('@anotheruser');
  });

  it('parses bullet-prefixed complaints with numbered issues', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan komplain',
        '• NRP/NIP: 79061548',
        '• Nama: INDRAYANA PRIBADI',
        '• Polres: Polres Blitar',
        '• Instagram: @indrabinmas',
        '• TikTok: @indra.yana0304',
        '',
        'Kendala',
        '1. Sudah melaksanakan like dan comment instagram belum terdata.',
        '2. Sudah melaksanakan like dan comment tiktok belum terdata.',
      ].join('\n')
    );

    expect(parsed.nrp).toBe('79061548');
    expect(parsed.name).toBe('INDRAYANA PRIBADI');
    expect(parsed.polres).toBe('Polres Blitar');
    expect(parsed.instagram).toBe('@indrabinmas');
    expect(parsed.tiktok).toBe('@indra.yana0304');
    expect(parsed.issues).toEqual([
      'Sudah melaksanakan like dan comment instagram belum terdata.',
      'Sudah melaksanakan like dan comment tiktok belum terdata.',
    ]);
  });

  it('keeps parsing fields even after the issue header appears', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan komplain',
        'Kendala',
        '- Sudah melaksanakan like instagram belum terdata.',
        'NRP/NIP: 12345678',
        'Nama: Example User',
        'Polres: Polres Example',
        'Username IG: exampleUser',
        'Username Tiktok: exampleTikTok',
        '- Sudah melaksanakan comment tiktok belum terdata.',
      ].join('\n')
    );

    expect(parsed.nrp).toBe('12345678');
    expect(parsed.name).toBe('Example User');
    expect(parsed.polres).toBe('Polres Example');
    expect(parsed.instagram).toBe('@exampleuser');
    expect(parsed.tiktok).toBe('@exampletiktok');
    expect(parsed.issues).toEqual([
      'Sudah melaksanakan like instagram belum terdata.',
      'Sudah melaksanakan comment tiktok belum terdata.',
    ]);
  });
});

describe('main menu bulk status option removal', () => {
  it('re-prompts when option 18 is entered and never calls the bulk status prompt', async () => {
    const session = { step: 'main' };
    const chatId = 'chat-main-menu';
    const sendMessage = jest.fn().mockResolvedValue();
    const bulkSpy = jest.spyOn(clientRequestHandlers, 'bulkStatus_prompt');

    try {
      await clientRequestHandlers.main(session, chatId, '18', {
        sendMessage,
      });

      expect(session.step).toBe('main');
      expect(sendMessage).toHaveBeenCalledTimes(1);
      const [[calledChatId, message]] = sendMessage.mock.calls;
      expect(calledChatId).toBe(chatId);
      expect(message).not.toContain('18');
      expect(message).not.toContain('Penghapusan');
      expect(bulkSpy).not.toHaveBeenCalled();
    } finally {
      bulkSpy.mockRestore();
    }
  });
});

describe('kelolaClient mass status option', () => {
  it('asks for confirmation before deleting a client', async () => {
    const session = {
      selected_client_id: 'CLIENT-001',
      clientList: [{ client_id: 'CLIENT-001', nama: 'Polres Contoh' }],
    };
    const chatId = 'chat-client-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaClient_menu(session, chatId, '2', {
      sendMessage,
    });

    expect(session.step).toBe('kelolaClient_confirmDelete');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('ya hapus')
    );
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('CLIENT-001')
    );
  });

  it('does not delete client without explicit confirmation', async () => {
    const session = { selected_client_id: 'CLIENT-001', step: 'kelolaClient_confirmDelete' };
    const chatId = 'chat-client-menu';
    const sendMessage = jest.fn().mockResolvedValue();
    const clientService = { deleteClient: jest.fn() };

    await clientRequestHandlers.kelolaClient_confirmDelete(
      session,
      chatId,
      'lanjutkan',
      { sendMessage },
      undefined,
      undefined,
      clientService
    );

    expect(clientService.deleteClient).not.toHaveBeenCalled();
    expect(session.step).toBe('kelolaClient_confirmDelete');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('ya hapus')
    );
  });

  it('deletes client after receiving the ya hapus confirmation', async () => {
    const session = { selected_client_id: 'CLIENT-001', step: 'kelolaClient_confirmDelete' };
    const chatId = 'chat-client-menu';
    const sendMessage = jest.fn().mockResolvedValue();
    const clientService = { deleteClient: jest.fn().mockResolvedValue(true) };

    await clientRequestHandlers.kelolaClient_confirmDelete(
      session,
      chatId,
      'ya hapus',
      { sendMessage },
      undefined,
      undefined,
      clientService
    );

    expect(clientService.deleteClient).toHaveBeenCalledWith('CLIENT-001');
    expect(session.step).toBe('main');
    expect(session.selected_client_id).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('berhasil dihapus')
    );
  });

  it('redirects kelola client option 4 to the bulk status prompt', async () => {
    const session = { selected_client_id: 'CLIENT-001' };
    const chatId = 'chat-client-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaClient_menu(session, chatId, '4', {
      sendMessage,
    });

    expect(session.step).toBe('bulkStatus_process');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Permohonan Penghapusan Data Personil')
    );
  });
});

describe('kelolaUser mass status option', () => {
  it('shows bulk status choice in the kelola user menu', async () => {
    const session = {};
    const chatId = 'chat-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaUser_choose(session, chatId, '', {
      sendMessage,
    });

    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('4️⃣ Ubah Status Massal')
    );
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('5️⃣ Ubah Client ID')
    );
    expect(session.step).toBe('kelolaUser_menu');
  });

  it('redirects kelola user option 4 to the bulk status prompt', async () => {
    const session = {};
    const chatId = 'chat-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaUser_menu(session, chatId, '4', {
      sendMessage,
    });

    expect(session.step).toBe('bulkStatus_process');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Permohonan Penghapusan Data Personil')
    );
  });

  it('routes option 5 through the user lookup flow', async () => {
    const session = {};
    const chatId = 'chat-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaUser_menu(session, chatId, '5', {
      sendMessage,
    });

    expect(session.kelolaUser_mode).toBe('5');
    expect(session.step).toBe('kelolaUser_nrp');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Masukkan *user_id* / NRP/NIP user:')
    );
  });
});

describe('clientMenu_transfer additions', () => {
  it('shows the absensi official account option', async () => {
    const session = {};
    const chatId = 'chat-transfer-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.clientMenu_transfer(session, chatId, '', {
      sendMessage,
    });

    expect(session.step).toBe('clientMenu_transfer');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('4️⃣ Absensi Official Account')
    );
  });

  it('routes option 4 to absensiSatbinmasOfficial', async () => {
    const session = {};
    const chatId = 'chat-transfer-menu';
    const sendMessage = jest.fn().mockResolvedValue();
    const handlerSpy = jest
      .spyOn(clientRequestHandlers, 'absensiSatbinmasOfficial')
      .mockResolvedValue();

    try {
      await clientRequestHandlers.clientMenu_transfer(session, chatId, '4', {
        sendMessage,
      });

      expect(handlerSpy).toHaveBeenCalled();
    } finally {
      handlerSpy.mockRestore();
    }
  });
});

describe('absensiSatbinmasOfficial', () => {
  it('renders attendance with platform status and instructions', async () => {
    const session = {};
    const chatId = 'chat-absensi-official';
    const sendMessage = jest.fn().mockResolvedValue();
    const attendanceSpy = jest
      .spyOn(
        satbinmasOfficialAccountService,
        'getSatbinmasOfficialAttendance'
      )
      .mockResolvedValue([
        {
          client_id: 'POLRES01',
          nama: 'Polres Example',
          instagram: true,
          tiktok: false,
        },
        {
          client_id: 'POLRES02',
          nama: '',
          instagram: false,
          tiktok: true,
        },
      ]);

    await clientRequestHandlers.absensiSatbinmasOfficial(session, chatId, '', {
      sendMessage,
    });

    expect(attendanceSpy).toHaveBeenCalled();
    expect(session.step).toBe('main');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining(
        'mengirimkan data akun resmi melalui pesan WhatsApp ke 0812-3511-4745'
      )
    );
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('✅ Absensi Lengkap')
    );
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('⚠️ Absensi Kurang')
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('POLRES02')
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Perlu:')
    );

    attendanceSpy.mockRestore();
  });

  it('reports failures gracefully', async () => {
    const session = {};
    const chatId = 'chat-absensi-official-error';
    const sendMessage = jest.fn().mockResolvedValue();
    const attendanceSpy = jest
      .spyOn(
        satbinmasOfficialAccountService,
        'getSatbinmasOfficialAttendance'
      )
      .mockRejectedValue(new Error('db unavailable'));

    await clientRequestHandlers.absensiSatbinmasOfficial(session, chatId, '', {
      sendMessage,
    });

    expect(attendanceSpy).toHaveBeenCalled();
    expect(session.step).toBe('main');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('❌ Gagal menyiapkan absensi akun resmi: db unavailable')
    );

    attendanceSpy.mockRestore();
  });
});

describe('kelolaUser_updateClientId', () => {
  it('validates the target client and updates the user', async () => {
    const session = { target_user_id: 'USR-1' };
    const chatId = 'chat-client-id';
    const sendMessage = jest.fn().mockResolvedValue();
    const updateUserField = jest.fn().mockResolvedValue();
    const findClientById = jest.fn(async (clientId) => {
      if (clientId === 'TARGET') {
        return { client_id: clientId };
      }
      return null;
    });

    await clientRequestHandlers.kelolaUser_updateClientId(
      session,
      chatId,
      '  target  ',
      { sendMessage },
      undefined,
      { updateUserField },
      { findClientById }
    );

    expect(findClientById).toHaveBeenCalledWith('TARGET');
    expect(updateUserField).toHaveBeenCalledWith(
      'USR-1',
      'client_id',
      'TARGET'
    );
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('TARGET')
    );
    expect(session.step).toBe('main');
  });

  it('sends an error when the target client is missing', async () => {
    const session = { target_user_id: 'USR-2' };
    const chatId = 'chat-client-id';
    const sendMessage = jest.fn().mockResolvedValue();
    const updateUserField = jest.fn().mockResolvedValue();
    const findClientById = jest.fn().mockResolvedValue(null);

    await clientRequestHandlers.kelolaUser_updateClientId(
      session,
      chatId,
      'missing',
      { sendMessage },
      undefined,
      { updateUserField },
      { findClientById }
    );

    expect(findClientById).toHaveBeenCalledWith('MISSING');
    expect(updateUserField).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('tidak ditemukan')
    );
    expect(session.step).toBe('main');
  });
});

describe('bulkStatus_process', () => {
  it('updates every listed user, fetches official names, and reports summary with reasons', async () => {
    const session = { step: 'bulkStatus_prompt' };
    const chatId = 'chat-1';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.bulkStatus_prompt(session, chatId, '', {
      sendMessage,
    });

    expect(session.step).toBe('bulkStatus_process');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Permohonan Penghapusan Data Personil')
    );

    sendMessage.mockClear();

    const updateUserField = jest.fn(async (userId, field) => {
      if (userId === '75020202' && field === 'whatsapp') {
        throw new Error('Tidak dapat menghapus WhatsApp');
      }
      return { user_id: userId };
    });
    const deactivateRoleOrUser = jest.fn(async (userId) => ({
      user_id: userId,
      nama: userId === '75020201' ? 'AKP Asep Sunandar' : 'IPTU Budi Santoso',
      status: false,
    }));
    const findUserById = jest.fn(async (userId) => {
      if (userId === '75020201') {
        return { user_id: userId, title: 'AKP', nama: 'Asep Sunandar' };
      }
      if (userId === '75020202') {
        return { user_id: userId, title: 'IPTU', nama: 'Budi Santoso' };
      }
      return null;
    });

    const requestMessage = [
      'Permohonan Penghapusan Data Personil – Polres Contoh',
      '',
      '1. Asep Sunandar – 75020201 – mutasi',
      '2. Budi Santoso - 75020202 - pensiun',
      '3. Carla Dewi – 75020203 – double data',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      requestMessage,
      { sendMessage },
      undefined,
      { updateUserField, findUserById, deactivateRoleOrUser }
    );

    const whatsappCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'whatsapp'
    );
    expect(whatsappCalls).toHaveLength(2);
    expect(whatsappCalls.map(([id]) => id)).toEqual([
      '75020201',
      '75020202',
    ]);
    expect(deactivateRoleOrUser).toHaveBeenCalledTimes(2);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const summaryMessage = sendMessage.mock.calls[0][1];
    expect(summaryMessage).toContain('✅ Permintaan diproses untuk 1 personel');
    expect(summaryMessage).toContain('75020201 (AKP Asep Sunandar) • mutasi • status: nonaktif');
    expect(summaryMessage).toContain(
      '75020202 (IPTU Budi Santoso) • pensiun → status dinonaktifkan, namun gagal mengosongkan WhatsApp: Tidak dapat menghapus WhatsApp'
    );
    expect(summaryMessage).toContain(
      '75020203 (Carla Dewi) • double data → user tidak ditemukan'
    );
    expect(session.step).toBe('main');
  });

  it('prompts for a role choice when a user has multiple active roles', async () => {
    const session = { step: 'bulkStatus_process' };
    const chatId = 'chat-multi-role';
    const sendMessage = jest.fn().mockResolvedValue();
    const userModel = {
      findUserById: jest.fn().mockResolvedValue({
        user_id: '75020201',
        nama: 'Asep Sunandar',
      }),
      getUserRoles: jest.fn().mockResolvedValue(['ditlantas', 'operator']),
      deactivateRoleOrUser: jest.fn(),
      updateUserField: jest.fn(),
    };

    const requestMessage = [
      'Permohonan Penghapusan Data Personil – Polres Contoh',
      '1. Asep Sunandar – 75020201 – mutasi',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      requestMessage,
      { sendMessage },
      undefined,
      userModel
    );

    expect(userModel.deactivateRoleOrUser).not.toHaveBeenCalled();
    expect(session.step).toBe('bulkStatus_applySelection');
    expect(session.bulkStatusContext.pendingSelections).toHaveLength(1);
    const promptMessage = sendMessage.mock.calls[0][1];
    expect(promptMessage).toContain('lebih dari satu role');
    expect(promptMessage).toContain('1. ditlantas');
    expect(promptMessage).toContain('2. operator');
  });

  it('ignores messages that are not bulk deletion requests', async () => {
    const session = { step: 'bulkStatus_process' };
    const chatId = 'chat-ignore';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      'Mohon bantu nonaktifkan user 75020201 karena mutasi.',
      { sendMessage }
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(session.step).toBe('bulkStatus_process');
  });

  it('ignores bot summary echoes without altering the session state', async () => {
    const session = { step: 'bulkStatus_process' };
    const chatId = 'chat-summary-echo';
    const sendMessage = jest.fn().mockResolvedValue();

    const botSummary = [
      '📄 *Permohonan Penghapusan Data Personil*',
      '',
      '✅ Status dinonaktifkan untuk 1 personel:',
      '- 75020201 (AKP Asep) • mutasi',
      '',
      '❌ 1 entri gagal diproses:',
      '- 75020202 (IPTU Budi) • pensiun → user tidak ditemukan',
      '',
      'Selesai diproses. Terima kasih.',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      botSummary,
      { sendMessage }
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(session.step).toBe('bulkStatus_process');
  });

  it.each(['wagateway', 'wabot'])(
    'ignores %s forwards that wrap bulk deletion summaries',
    async (prefix) => {
      const session = { step: 'bulkStatus_process' };
      const chatId = `chat-${prefix}`;
      const sendMessage = jest.fn().mockResolvedValue();

      const forwardedMessage = [
        `${prefix} | 628123456789`,
        'Permohonan Penghapusan Data Personil – Polres Contoh',
        '✅ Status dinonaktifkan untuk 1 personel:',
        '- 75020201 (AKP Asep) • mutasi',
      ].join('\n');

      await clientRequestHandlers.bulkStatus_process(
        session,
        chatId,
        forwardedMessage,
        { sendMessage }
      );

      expect(sendMessage).not.toHaveBeenCalled();
      expect(session.step).toBe('bulkStatus_process');
    }
  );

  it('parses reason-first entries that include the name in parentheses', async () => {
    const session = { step: 'bulkStatus_process' };
    const chatId = 'chat-reason-first';
    const sendMessage = jest.fn().mockResolvedValue();

    const updateUserField = jest.fn().mockResolvedValue();

    const requestMessage = [
      'Permohonan Penghapusan Data Personil - POLRESTABES SURABAYA',
      '',
      '1. MUTASI (AIPTU ERWAN WAHYUDI) • 76070503',
      '2. PENSIUN (AIPTU KANTUN SUTRISNO) – 67030561',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      requestMessage,
      { sendMessage },
      undefined,
      {
        updateUserField,
        deactivateRoleOrUser: jest.fn(async (userId) => ({
          user_id: userId,
          status: false,
        })),
        findUserById: jest.fn(async (userId) => {
          if (userId === '76070503') {
            return { user_id: userId, title: 'AIPTU', nama: 'ERWAN WAHYUDI' };
          }
          if (userId === '67030561') {
            return { user_id: userId, title: 'AIPTU', nama: 'KANTUN SUTRISNO' };
          }
          return null;
        }),
      }
    );

    const whatsappCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'whatsapp'
    );
    expect(whatsappCalls.map(([id]) => id)).toEqual(['76070503', '67030561']);

    const summaryMessage = sendMessage.mock.calls[0][1];
    expect(summaryMessage).toContain('76070503 (AIPTU ERWAN WAHYUDI) • MUTASI • status: nonaktif');
    expect(summaryMessage).toContain('67030561 (AIPTU KANTUN SUTRISNO) • PENSIUN • status: nonaktif');
    expect(session.step).toBe('main');
  });

  it('completes pending selections and summarizes the result', async () => {
    const session = {
      step: 'bulkStatus_applySelection',
      bulkStatusContext: {
        headerLine: 'Permohonan Penghapusan Data Personil – Polres Contoh',
        successes: [],
        failures: [],
        pendingSelections: [
          {
            userId: '75020201',
            name: 'Asep Sunandar',
            reason: 'mutasi',
            roles: ['ditlantas', 'operator'],
          },
        ],
      },
    };
    const chatId = 'chat-apply-role';
    const sendMessage = jest.fn().mockResolvedValue();
    const userModel = {
      deactivateRoleOrUser: jest
        .fn()
        .mockResolvedValue({ user_id: '75020201', status: false }),
      updateUserField: jest.fn().mockResolvedValue(),
    };

    await clientRequestHandlers.bulkStatus_applySelection(
      session,
      chatId,
      '2',
      { sendMessage },
      undefined,
      userModel
    );

    expect(userModel.deactivateRoleOrUser).toHaveBeenCalledWith(
      '75020201',
      'operator'
    );
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      '75020201',
      'whatsapp',
      ''
    );
    const summaryMessage = sendMessage.mock.calls[0][1];
    expect(summaryMessage).toContain('✅ Permintaan diproses untuk 1 personel');
    expect(summaryMessage).toContain('role: operator');
    expect(summaryMessage).toContain('status: nonaktif');
    expect(session.step).toBe('main');
    expect(session.bulkStatusContext).toBeUndefined();
  });

  it('cancels pending role selections when the user exits', async () => {
    const session = {
      step: 'bulkStatus_applySelection',
      bulkStatusContext: {
        headerLine: 'Permohonan Penghapusan Data Personil',
        successes: [],
        failures: [],
        pendingSelections: [
          { userId: '75020201', name: 'Asep Sunandar', roles: ['ditlantas'] },
        ],
      },
    };
    const chatId = 'chat-cancel-role';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.bulkStatus_applySelection(
      session,
      chatId,
      'batal',
      { sendMessage }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('dibatalkan')
    );
    expect(session.step).toBe('main');
    expect(session.bulkStatusContext).toBeUndefined();
  });
});

describe('parseBulkStatusEntries', () => {
  it('extracts id and reason from narrative sentences', () => {
    const message = [
      'Mohon bantu nonaktifkan personel atas nama Brigadir Budi Hartono NRP 75020205 karena pindah tugas ke Ditreskrimum.',
      'Terima kasih.',
    ].join(' ');

    const { entries } = parseBulkStatusEntries(message);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawId: '75020205',
          reason: 'pindah tugas ke Ditreskrimum',
        }),
      ])
    );
  });

  it('merges numbered entries with narrative requests', () => {
    const message = [
      'Permohonan Penghapusan Data Personil - POLRES CONTOH',
      '1. Asep Sunandar - 75020201 - mutasi',
      'Mohon juga user 75020205 karena data ganda di satuan lain.',
      '2. Budi Santoso - 75020202 - pensiun',
    ].join('\n');

    const { entries } = parseBulkStatusEntries(message);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rawId: '75020201', reason: 'mutasi' }),
        expect.objectContaining({ rawId: '75020202', reason: 'pensiun' }),
        expect.objectContaining({
          rawId: '75020205',
          reason: 'data ganda di satuan lain',
        }),
      ])
    );
  });
});


describe('prosesTiktok menu delete option', () => {
  it('switches to the delete prompt when option 5 is selected', async () => {
    const session = { selected_client_id: 'client-123' };
    const chatId = 'chat-delete-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.prosesTiktok_menu(
      session,
      chatId,
      '5',
      { sendMessage },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    expect(session.step).toBe('prosesTiktok_delete_prompt');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('hapus konten TikTok')
    );
  });
});

describe('prosesTiktok_delete_prompt', () => {
  it('removes TikTok post data for the selected client', async () => {
    const session = {
      selected_client_id: 'client-123',
      step: 'prosesTiktok_delete_prompt',
    };
    const chatId = 'chat-delete';
    const sendMessage = jest.fn().mockResolvedValue();

    const findSpy = jest
      .spyOn(tiktokPostModel, 'findPostByVideoId')
      .mockResolvedValue({
        client_id: 'client-123',
        caption: 'Contoh caption',
        created_at: new Date('2024-01-01T10:00:00Z'),
        like_count: 12,
        comment_count: 4,
      });
    const deletePostSpy = jest
      .spyOn(tiktokPostModel, 'deletePostByVideoId')
      .mockResolvedValue(1);
    const deleteCommentsSpy = jest
      .spyOn(tiktokCommentModel, 'deleteCommentsByVideoId')
      .mockResolvedValue(2);

    try {
      await clientRequestHandlers.prosesTiktok_delete_prompt(
        session,
        chatId,
        '7571332440556571924',
        { sendMessage }
      );

      expect(findSpy).toHaveBeenCalledWith('7571332440556571924');
      expect(deleteCommentsSpy).toHaveBeenCalledWith('7571332440556571924');
      expect(deletePostSpy).toHaveBeenCalledWith('7571332440556571924');
      expect(session.step).toBe('main');
      expect(sendMessage).toHaveBeenCalledTimes(1);
      const [[calledChatId, message]] = sendMessage.mock.calls;
      expect(calledChatId).toBe(chatId);
      expect(message).toContain('Konten TikTok berhasil dihapus');
    } finally {
      findSpy.mockRestore();
      deletePostSpy.mockRestore();
      deleteCommentsSpy.mockRestore();
    }
  });
});
