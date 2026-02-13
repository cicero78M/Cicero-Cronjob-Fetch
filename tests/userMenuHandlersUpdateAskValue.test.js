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

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByInsta).toHaveBeenCalledWith("user.name");
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "insta",
      "user.name"
    );
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

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("another.user");
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "tiktok",
      "another.user"
    );
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
    expect(userModel.updateUserField).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "❌ Akun TikTok tersebut sudah terdaftar pada pengguna lain."
    );
  });
});
