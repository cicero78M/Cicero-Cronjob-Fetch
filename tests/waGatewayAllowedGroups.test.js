import { EventEmitter } from "events";
import { jest } from "@jest/globals";

function createClientStub() {
  const emitter = new EventEmitter();
  emitter.connect = jest.fn();
  emitter.disconnect = jest.fn();
  emitter.sendMessage = jest.fn().mockResolvedValue("mock-id");
  emitter.waitForWaReady = jest.fn().mockResolvedValue();
  emitter.onDisconnect = (handler) => {
    emitter.on("disconnected", handler);
  };
  emitter.getState = jest.fn().mockResolvedValue("open");
  emitter.sendSeen = jest.fn().mockResolvedValue();
  emitter.getContact = jest.fn().mockResolvedValue(null);
  emitter.getChatById = jest.fn().mockResolvedValue({});
  emitter.isReady = jest.fn().mockReturnValue(true);
  emitter.once = emitter.once.bind(emitter);
  emitter.on = emitter.on.bind(emitter);
  emitter.emit = emitter.emit.bind(emitter);
  return emitter;
}

describe("waService gateway allowed group cache", () => {
  const originalSkipInit = process.env.WA_SERVICE_SKIP_INIT;
  const originalAdminWhatsApp = process.env.ADMIN_WHATSAPP;

  afterAll(() => {
    if (originalSkipInit === undefined) {
      delete process.env.WA_SERVICE_SKIP_INIT;
    } else {
      process.env.WA_SERVICE_SKIP_INIT = originalSkipInit;
    }

    if (originalAdminWhatsApp === undefined) {
      delete process.env.ADMIN_WHATSAPP;
    } else {
      process.env.ADMIN_WHATSAPP = originalAdminWhatsApp;
    }
  });

  test("refreshes allowed gateway groups from active clients", async () => {
    jest.resetModules();
    process.env.WA_SERVICE_SKIP_INIT = "true";
    process.env.ADMIN_WHATSAPP = "987";

    const handleComplaintMock = jest.fn().mockResolvedValue(true);
    const isGatewayComplaintForwardMock = jest.fn().mockReturnValue(false);

    const queryMock = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ client_group: "allowed@g.us" }] })
      .mockResolvedValueOnce({ rows: [{ client_group: "new-allowed@g.us" }] });

    const sessionStore = new Map();
    const sessionHelperMock = {
      userMenuContext: {},
      updateUsernameSession: jest.fn(),
      userRequestLinkSessions: new Map(),
      knownUserSet: new Set(),
      setMenuTimeout: jest.fn(),
      waBindSessions: new Map(),
      setBindTimeout: jest.fn(),
      operatorOptionSessions: new Map(),
      setOperatorOptionTimeout: jest.fn(),
      adminOptionSessions: new Map(),
      setAdminOptionTimeout: jest.fn(),
      setUserRequestLinkTimeout: jest.fn(),
      setSession: jest.fn((chatId, payload) => sessionStore.set(chatId, payload)),
      getSession: jest.fn((chatId) => sessionStore.get(chatId)),
      clearSession: jest.fn((chatId) => sessionStore.delete(chatId)),
    };

    jest.unstable_mockModule("../src/service/wwebjsAdapter.js", () => ({
      createWwebjsClient: jest.fn(() => createClientStub()),
    }));

    jest.unstable_mockModule("../src/service/waAutoComplaintService.js", () => ({
      handleComplaintMessageIfApplicable: handleComplaintMock,
      shouldHandleComplaintMessage: jest.fn(),
      isGatewayComplaintForward: isGatewayComplaintForwardMock,
    }));

    jest.unstable_mockModule("../src/service/waEventAggregator.js", () => ({
      handleIncoming: jest.fn(),
    }));

    jest.unstable_mockModule("../src/db/index.js", () => ({ query: queryMock }));

    jest.unstable_mockModule("../src/config/env.js", () => ({
      env: {
        USER_WA_CLIENT_ID: "user-client",
        GATEWAY_WA_CLIENT_ID: "gateway-client",
      },
    }));

    jest.unstable_mockModule("../src/service/clientService.js", () => ({
      findClientById: jest.fn(),
      updateClient: jest.fn(),
      createClient: jest.fn(),
    }));

    jest.unstable_mockModule("../src/model/userModel.js", () => ({
      findUserByWhatsApp: jest.fn(),
      getUsersByClient: jest.fn(),
    }));

    jest.unstable_mockModule("../src/model/dashboardUserModel.js", () => ({
      findAllByWhatsApp: jest.fn().mockResolvedValue([]),
    }));

    jest.unstable_mockModule("../src/model/clientModel.js", () => ({
      findByOperator: jest.fn(),
      findBySuperAdmin: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/premiumService.js", () => ({}));
    jest.unstable_mockModule("../src/model/premiumRequestModel.js", () => ({}));

    jest.unstable_mockModule("../src/service/userMigrationService.js", () => ({
      migrateUsersFromFolder: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/checkGoogleSheetAccess.js", () => ({
      checkGoogleSheetCsvStatus: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/importUsersFromGoogleSheet.js", () => ({
      importUsersFromGoogleSheet: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/fetchpost/instaFetchPost.js", () => ({
      fetchAndStoreInstaContent: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/fetchengagement/fetchLikesInstagram.js", () => ({
      handleFetchLikesInstagram: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/fetchpost/tiktokFetchPost.js", () => ({
      getTiktokSecUid: jest.fn(),
      fetchAndStoreTiktokContent: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/instagramApi.js", () => ({
      fetchInstagramProfile: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/tiktokRapidService.js", () => ({
      fetchTiktokProfile: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/fetchabsensi/insta/absensiLikesInsta.js", () => ({
      absensiLikes: jest.fn(),
      absensiLikesPerKonten: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js", () => ({
      absensiKomentar: jest.fn(),
      absensiKomentarTiktokPerKonten: jest.fn(),
    }));

    jest.unstable_mockModule("../src/model/instaLikeModel.js", () => ({
      getLikesByShortcode: jest.fn(),
      hasUserLikedBetween: jest.fn(),
      getRekapLikesByClient: jest.fn(),
    }));

    jest.unstable_mockModule("../src/model/instaPostModel.js", () => ({
      getShortcodesTodayByClient: jest.fn(),
    }));

    jest.unstable_mockModule("../src/handler/menu/userMenuHandlers.js", () => ({
      userMenuHandlers: { main: jest.fn() },
    }));

    jest.unstable_mockModule("../src/handler/menu/oprRequestHandlers.js", () => ({
      oprRequestHandlers: {},
    }));

    jest.unstable_mockModule("../src/handler/menu/dashRequestHandlers.js", () => ({
      dashRequestHandlers: {},
    }));

    jest.unstable_mockModule("../src/handler/menu/dirRequestHandlers.js", () => ({
      dirRequestHandlers: {},
    }));

    jest.unstable_mockModule("../src/handler/menu/wabotDitbinmasHandlers.js", () => ({
      wabotDitbinmasHandlers: { main: jest.fn() },
    }));

    jest.unstable_mockModule("../src/handler/fetchengagement/fetchCommentTiktok.js", () => ({
      handleFetchKomentarTiktokBatch: jest.fn(),
    }));

    jest.unstable_mockModule("../src/service/googleContactsService.js", () => ({
      saveContactIfNew: jest.fn(),
      authorize: jest.fn(),
      searchByNumbers: jest.fn(),
      saveGoogleContact: jest.fn(),
    }));

    jest.unstable_mockModule("../src/utils/constants.js", () => ({
      IG_PROFILE_REGEX: /@(\w+)/i,
      TT_PROFILE_REGEX: /@(\w+)/i,
      adminCommands: [],
      hariIndo: [],
      PRIORITY_USER_NAMES: [],
    }));

    jest.unstable_mockModule("../src/utils/waHelper.js", () => ({
      isAdminWhatsApp: jest.fn().mockReturnValue(false),
      formatToWhatsAppId: jest.fn((value) => value),
      formatClientData: jest.fn(),
      safeSendMessage: jest.fn(),
      sendWithClientFallback: jest.fn(),
      getAdminWAIds: jest.fn().mockReturnValue([]),
      isUnsupportedVersionError: jest.fn(),
    }));

    jest.unstable_mockModule("../src/utils/sessionsHelper.js", () => sessionHelperMock);

    jest.unstable_mockModule(
      "../src/service/satbinmasOfficialAccountService.js",
      () => ({
        listSatbinmasOfficialAccounts: jest.fn().mockResolvedValue([]),
      })
    );

    const {
      handleGatewayMessage,
      refreshGatewayAllowedGroups,
    } = await import("../src/service/waService.js");

    await handleGatewayMessage({
      from: "blocked@g.us",
      body: "Ping",
      author: "user@s.whatsapp.net",
    });

    expect(handleComplaintMock).not.toHaveBeenCalled();

    await handleGatewayMessage({
      from: "allowed@g.us",
      body: "Ping",
      author: "user@s.whatsapp.net",
    });

    expect(handleComplaintMock).toHaveBeenCalledTimes(1);

    await refreshGatewayAllowedGroups("test refresh");

    await handleGatewayMessage({
      from: "new-allowed@g.us",
      body: "Ping",
      author: "user@s.whatsapp.net",
    });

    expect(handleComplaintMock).toHaveBeenCalledTimes(2);

    await handleGatewayMessage({
      from: "allowed@g.us",
      body: "Ping",
      author: "user@s.whatsapp.net",
    });

    expect(handleComplaintMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
