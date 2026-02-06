import { jest } from '@jest/globals';
import { handleIncoming } from '../src/service/waEventAggregator.js';

afterEach(() => {
  jest.useRealTimers();
});

test('wwebjs takes precedence over baileys', () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  const msg = { from: '123', id: { id: 'abc', _serialized: 'abc' } };

  handleIncoming('baileys', msg, handler);
  jest.advanceTimersByTime(100);
  handleIncoming('wwebjs', msg, handler);
  jest.runAllTimers();

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith(msg);
});

test('baileys processed if wwebjs absent', () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  const msg = { from: '456', id: { id: 'def', _serialized: 'def' } };

  handleIncoming('baileys', msg, handler);
  jest.advanceTimersByTime(250);
  jest.runAllTimers();

  expect(handler).toHaveBeenCalledTimes(1);
});
