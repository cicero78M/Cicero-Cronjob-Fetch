import {
  setSession,
  getSession,
  clearSession,
  getSessionVersion,
  ensureSessionVersion,
  transitionSessionState,
  captureSessionVersionSnapshot,
  canSendAsyncSessionReply,
} from '../src/utils/sessionsHelper.js';

describe('sessionsHelper sessionVersion utilities', () => {
  const chatId = 'chat-version-test';

  afterEach(() => {
    clearSession(chatId);
  });

  test('initializes sessionVersion to 0', () => {
    expect(getSessionVersion(chatId)).toBe(0);
    ensureSessionVersion(chatId);
    expect(getSession(chatId).sessionVersion).toBe(0);
  });

  test('increments sessionVersion only when state changes', () => {
    setSession(chatId, { step: 'awaiting_instagram' });
    ensureSessionVersion(chatId);

    const firstTransition = transitionSessionState(chatId, 'awaiting_instagram');
    expect(firstTransition.sessionVersion).toBe(0);

    const secondTransition = transitionSessionState(chatId, 'main_menu');
    expect(secondTransition.previousState).toBe('awaiting_instagram');
    expect(secondTransition.sessionVersion).toBe(1);

    const thirdTransition = transitionSessionState(chatId, 'main_menu');
    expect(thirdTransition.sessionVersion).toBe(1);
  });

  test('marks stale async responses when sessionVersion changed', () => {
    setSession(chatId, { step: 'awaiting_tiktok' });
    ensureSessionVersion(chatId);

    const versionAtStart = captureSessionVersionSnapshot(chatId);
    expect(versionAtStart).toBe(0);

    transitionSessionState(chatId, 'main_menu');

    const staleCheck = canSendAsyncSessionReply(chatId, versionAtStart);
    expect(staleCheck.shouldSend).toBe(false);
    expect(staleCheck.currentVersion).toBe(1);
    expect(staleCheck.droppedAsStale).toBe(true);
  });
});
