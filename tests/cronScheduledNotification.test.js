// tests/cronScheduledNotification.test.js

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('Scheduled Notification Time Check', () => {
  let originalDate;

  beforeEach(() => {
    // Store original Date
    originalDate = global.Date;
  });

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate;
  });

  const mockDateForJakartaTime = (hour, minute) => {
    // Create a mock date for Jakarta timezone (UTC+7)
    // If Jakarta time is 06:30, UTC time is 23:30 the previous day
    const utcHour = hour - 7;
    const mockDate = new Date(2024, 0, 1, utcHour, minute, 0);
    
    // Mock Date constructor
    global.Date = class extends originalDate {
      constructor() {
        return mockDate;
      }
      
      static now() {
        return mockDate.getTime();
      }
      
      // Keep the static methods from original Date
      static parse = originalDate.parse;
      static UTC = originalDate.UTC;
    };

    // Mock toLocaleString to return Jakarta time
    mockDate.toLocaleString = jest.fn(() => {
      const jakartaDate = new originalDate(2024, 0, 1, hour, minute, 0);
      return jakartaDate.toString();
    });

    return mockDate;
  };

  const isScheduledNotificationTime = () => {
    const SCHEDULED_NOTIFICATION_TIMES = [
      { hour: 6, minute: 30 },   // 06:30
      { hour: 14, minute: 0 },   // 14:00
      { hour: 17, minute: 0 }    // 17:00
    ];

    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentHour = jakartaTime.getHours();
    const currentMinute = jakartaTime.getMinutes();
    
    return SCHEDULED_NOTIFICATION_TIMES.some(
      scheduledTime => scheduledTime.hour === currentHour && scheduledTime.minute === currentMinute
    );
  };

  it('should return true at 06:30 Jakarta time', () => {
    mockDateForJakartaTime(6, 30);
    const result = isScheduledNotificationTime();
    expect(result).toBe(true);
  });

  it('should return true at 14:00 Jakarta time', () => {
    mockDateForJakartaTime(14, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(true);
  });

  it('should return true at 17:00 Jakarta time', () => {
    mockDateForJakartaTime(17, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(true);
  });

  it('should return false at 06:31 Jakarta time', () => {
    mockDateForJakartaTime(6, 31);
    const result = isScheduledNotificationTime();
    expect(result).toBe(false);
  });

  it('should return false at 12:00 Jakarta time', () => {
    mockDateForJakartaTime(12, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(false);
  });

  it('should return false at 08:00 Jakarta time', () => {
    mockDateForJakartaTime(8, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(false);
  });

  it('should return false at 20:00 Jakarta time', () => {
    mockDateForJakartaTime(20, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(false);
  });

  it('should return false at 00:00 Jakarta time', () => {
    mockDateForJakartaTime(0, 0);
    const result = isScheduledNotificationTime();
    expect(result).toBe(false);
  });
});
