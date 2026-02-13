import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";
import { userMenuHandlers } from "../src/handler/menu/userMenuHandlers.js";

describe("userMenuHandlers.updateAskValue social media normalization", () => {
  const chatId = "628111222333@c.us";
  let waClient;
  let userModel;
  const pool = null;

  beforeEach(() => {
    waClient = { sendMessage: jest.fn().mockResolvedValue() };
    userModel = {
      updateUserField: jest.fn().mockResolvedValue(),
      updateUserFieldWithSessionVersion: jest.fn(),
      findUserById: jest.fn(),
      findUserByInsta: jest.fn().mockResolvedValue(null),
      findUserByTiktok: jest.fn().mockResolvedValue(null),
    };
    jest.spyOn(userMenuHandlers, "main").mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildSession = (field) => ({
    updateUserId: "12345",
    updateField: field,
  });

  test.each([
    ["https://www.instagram.com/User.Name"],
    ["@User.Name"],
    ["User.Name"],
  ])("normalizes Instagram input %s to lowercase username", async (input) => {
    const session = buildSession("insta");
    userModel.updateUserFieldWithSessionVersion.mockResolvedValue({
      user: { insta: "user.name" },
      sessionVersion: 1,
    });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByInsta).toHaveBeenCalledWith("user.name");
    expect(userModel.updateUserFieldWithSessionVersion).toHaveBeenCalledWith({
      userId: "12345",
      field: "insta",
      value: "user.name",
      expectedSessionVersion: 0,
    });
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*@user.name*.")
    );
  });

  test.each([
    ["https://www.tiktok.com/@Another.User"],
    ["@Another.User"],
    ["Another.User"],
  ])("normalizes TikTok input %s to lowercase username", async (input) => {
    const session = buildSession("tiktok");
    userModel.updateUserFieldWithSessionVersion.mockResolvedValue({
      user: { tiktok: "another.user" },
      sessionVersion: 1,
    });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("another.user");
    expect(userModel.updateUserFieldWithSessionVersion).toHaveBeenCalledWith({
      userId: "12345",
      field: "tiktok",
      value: "another.user",
      expectedSessionVersion: 0,
    });
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*@another.user*.")
    );
  });

  it("rejects TikTok update when username already used by different user", async () => {
    const session = buildSession("tiktok");
    userModel.findUserByTiktok.mockResolvedValue({ user_id: "99999" });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "https://www.tiktok.com/@duplicate.user",
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("duplicate.user");
    expect(userModel.updateUserFieldWithSessionVersion).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "❌ Akun TikTok tersebut sudah terdaftar pada pengguna lain."
    );
  });

  it("handles two rapid Instagram inputs with different validation result", async () => {
    const session = buildSession("insta");

    userModel.findUserByInsta
      .mockResolvedValueOnce({ user_id: "99999" })
      .mockResolvedValueOnce(null);
    userModel.updateUserFieldWithSessionVersion.mockResolvedValue({
      user: { insta: "valid.username" },
      sessionVersion: 1,
    });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      { body: "@duplicate.username", id: "wamid.1" },
      waClient,
      pool,
      userModel
    );

    expect(session.pendingInput).toBe("duplicate.username");
    expect(session.pendingInputMessageId).toBe("wamid.1");
    expect(typeof session.pendingInputAt).toBe("number");
    expect(userModel.updateUserFieldWithSessionVersion).not.toHaveBeenCalled();

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      { body: "@valid.username", id: "wamid.2" },
      waClient,
      pool,
      userModel
    );

    expect(userModel.updateUserFieldWithSessionVersion).toHaveBeenCalledWith({
      userId: "12345",
      field: "insta",
      value: "valid.username",
      expectedSessionVersion: 0,
    });
    expect(session.pendingInput).toBeUndefined();
    expect(session.pendingInputMessageId).toBeUndefined();
    expect(session.pendingInputAt).toBeUndefined();
  });

  it("returns stale session warning on session version mismatch", async () => {
    const session = buildSession("insta");
    session.sessionVersion = 7;
    userModel.updateUserFieldWithSessionVersion.mockResolvedValue({
      versionMismatch: true,
    });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "@fresh.user",
      waClient,
      pool,
      userModel
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "⚠️ sesi sudah berubah, silakan ulangi"
    );
    expect(session.step).toBe("tanyaUpdateMyData");
  });
});
