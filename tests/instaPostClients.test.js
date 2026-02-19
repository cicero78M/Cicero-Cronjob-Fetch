// tests/instaPostClients.test.js
import { jest } from '@jest/globals';

// Mock the database module before importing anything that uses it
const mockQuery = jest.fn();
jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

// Now import the module under test
const { 
  addClientToPost,
  getClientsByShortcode,
  getShortcodesByClient,
  removeClientFromPost,
  hasAnyClients,
  getShortcodesTodayByClientFromJunction
} = await import('../src/model/instaPostClientsModel.js');

describe('instaPostClientsModel', () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  describe('addClientToPost', () => {
    it('should insert client-post association with ON CONFLICT DO NOTHING', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await addClientToPost('ABC123', 'client1');
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO insta_post_clients'),
        ['ABC123', 'client1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (shortcode, client_id) DO NOTHING'),
        expect.any(Array)
      );
    });
  });

  describe('getClientsByShortcode', () => {
    it('should return array of client IDs for a shortcode', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { client_id: 'client1' },
          { client_id: 'client2' }
        ]
      });
      
      const result = await getClientsByShortcode('ABC123');
      
      expect(result).toEqual(['client1', 'client2']);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT client_id FROM insta_post_clients WHERE shortcode = $1',
        ['ABC123']
      );
    });

    it('should return empty array when no clients found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      const result = await getClientsByShortcode('NONEXISTENT');
      
      expect(result).toEqual([]);
    });
  });

  describe('getShortcodesByClient', () => {
    it('should return array of shortcodes for a client', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { shortcode: 'ABC123' },
          { shortcode: 'XYZ789' }
        ]
      });
      
      const result = await getShortcodesByClient('client1');
      
      expect(result).toEqual(['ABC123', 'XYZ789']);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT shortcode FROM insta_post_clients WHERE client_id = $1',
        ['client1']
      );
    });
  });

  describe('removeClientFromPost', () => {
    it('should delete client-post association', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await removeClientFromPost('ABC123', 'client1');
      
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM insta_post_clients WHERE shortcode = $1 AND client_id = $2',
        ['ABC123', 'client1']
      );
    });
  });

  describe('hasAnyClients', () => {
    it('should return true when shortcode has clients', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '2' }] });
      
      const result = await hasAnyClients('ABC123');
      
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM insta_post_clients WHERE shortcode = $1',
        ['ABC123']
      );
    });

    it('should return false when shortcode has no clients', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });
      
      const result = await hasAnyClients('NONEXISTENT');
      
      expect(result).toBe(false);
    });
  });

  describe('getShortcodesTodayByClientFromJunction', () => {
    it('should return shortcodes for client created today in Jakarta timezone', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { shortcode: 'ABC123' },
          { shortcode: 'XYZ789' }
        ]
      });
      
      const result = await getShortcodesTodayByClientFromJunction('client1');
      
      expect(result).toEqual(['ABC123', 'XYZ789']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN insta_post p ON p.shortcode = pc.shortcode'),
        expect.arrayContaining(['client1', expect.any(String)])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("AT TIME ZONE 'Asia/Jakarta'"),
        expect.any(Array)
      );
    });
  });

  describe('collaboration post scenario', () => {
    it('should allow multiple clients to share the same shortcode', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      // Add same shortcode to two different clients
      await addClientToPost('COLLAB_POST_123', 'client1');
      await addClientToPost('COLLAB_POST_123', 'client2');
      
      expect(mockQuery).toHaveBeenCalledTimes(2);
      
      // Both calls should have the same shortcode but different clients
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.any(String), ['COLLAB_POST_123', 'client1']);
      expect(mockQuery).toHaveBeenNthCalledWith(2, expect.any(String), ['COLLAB_POST_123', 'client2']);
    });
  });
});
