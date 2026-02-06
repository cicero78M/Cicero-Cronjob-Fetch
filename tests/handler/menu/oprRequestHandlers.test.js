import { jest } from '@jest/globals';

describe('oprRequestHandlers - Conditional Menu Display', () => {
  let oprRequestHandlers;
  let mockPool;
  let mockWaClient;
  let mockUserModel;
  let mockSession;
  
  beforeEach(async () => {
    // Reset all modules before each test
    jest.resetModules();
    
    // Mock dependencies
    jest.unstable_mockModule('../../../src/utils/waHelper.js', () => ({
      isAdminWhatsApp: jest.fn(() => false),
      formatToWhatsAppId: jest.fn((id) => id)
    }));
    
    jest.unstable_mockModule('../../../src/service/googleContactsService.js', () => ({
      saveContactIfNew: jest.fn()
    }));
    
    jest.unstable_mockModule('../../../src/utils/constants.js', () => ({
      hariIndo: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    }));
    
    jest.unstable_mockModule('../../../src/utils/utilsHelper.js', () => ({
      getGreeting: jest.fn(() => 'Selamat Pagi'),
      sortDivisionKeys: jest.fn((keys) => keys),
      sortTitleKeys: jest.fn((keys) => keys)
    }));
    
    jest.unstable_mockModule('../../../src/handler/menu/menuPromptHelpers.js', () => ({
      appendSubmenuBackInstruction: jest.fn((msg) => msg)
    }));
    
    const module = await import('../../../src/handler/menu/oprRequestHandlers.js');
    oprRequestHandlers = module.oprRequestHandlers;
    
    mockPool = {
      query: jest.fn()
    };
    
    mockWaClient = {
      sendMessage: jest.fn()
    };
    
    mockUserModel = {};
    
    mockSession = {
      selected_client_id: 'TEST_CLIENT'
    };
  });
  
  afterEach(() => {
    jest.resetAllMocks();
  });
  
  describe('main - Menu Display', () => {
    it('should show all three menus when all statuses are true', async () => {
      // Mock client with all statuses true
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: true,
          client_insta_status: true,
          client_tiktok_status: true,
          client_amplify_status: true,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).toContain('2️⃣ Manajemen Amplifikasi');
      expect(sentMessage).toContain('3️⃣ Manajemen Engagement');
      expect(mockSession.menuMapping).toEqual({
        1: 'user',
        2: 'amplifikasi',
        3: 'engagement'
      });
    });
    
    it('should hide Manajemen Amplifikasi when client_amplify_status is false', async () => {
      // Mock client with amplify_status false
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: true,
          client_insta_status: true,
          client_tiktok_status: true,
          client_amplify_status: false,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).not.toContain('Manajemen Amplifikasi');
      expect(sentMessage).toContain('2️⃣ Manajemen Engagement');
      expect(mockSession.menuMapping).toEqual({
        1: 'user',
        2: 'engagement'
      });
    });
    
    it('should hide Manajemen Engagement when both instagram and tiktok are false', async () => {
      // Mock client with both social media statuses false
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: true,
          client_insta_status: false,
          client_tiktok_status: false,
          client_amplify_status: true,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).toContain('2️⃣ Manajemen Amplifikasi');
      expect(sentMessage).not.toContain('Manajemen Engagement');
      expect(mockSession.menuMapping).toEqual({
        1: 'user',
        2: 'amplifikasi'
      });
    });
    
    it('should show Manajemen Engagement when only instagram is true', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: true,
          client_insta_status: true,
          client_tiktok_status: false,
          client_amplify_status: true,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).toContain('2️⃣ Manajemen Amplifikasi');
      expect(sentMessage).toContain('3️⃣ Manajemen Engagement');
    });
    
    it('should show Manajemen Engagement when only tiktok is true', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: true,
          client_insta_status: false,
          client_tiktok_status: true,
          client_amplify_status: true,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('Manajemen Engagement');
    });
    
    it('should hide both Amplifikasi and Engagement when client_status is false', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          client_id: 'TEST_CLIENT',
          client_status: false,
          client_insta_status: true,
          client_tiktok_status: true,
          client_amplify_status: true,
          client_type: 'org'
        }]
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).not.toContain('Manajemen Amplifikasi');
      expect(sentMessage).not.toContain('Manajemen Engagement');
      expect(mockSession.menuMapping).toEqual({
        1: 'user'
      });
    });
    
    it('should only show Manajemen User when no client is found', async () => {
      mockPool.query.mockResolvedValue({
        rows: []
      });
      
      await oprRequestHandlers.main(mockSession, '628123456789', '', mockWaClient, mockPool, mockUserModel);
      
      expect(mockWaClient.sendMessage).toHaveBeenCalled();
      const sentMessage = mockWaClient.sendMessage.mock.calls[0][1];
      
      expect(sentMessage).toContain('1️⃣ Manajemen User');
      expect(sentMessage).not.toContain('Manajemen Amplifikasi');
      expect(sentMessage).not.toContain('Manajemen Engagement');
    });
  });
});
