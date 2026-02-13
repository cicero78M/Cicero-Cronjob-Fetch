const SESSION_CLOSED_MESSAGE = "✅ Sesi ditutup. Ketik *menu* jika ingin membuka lagi.";

const sanitizeInput = (value) => String(value || "").trim();

const normalizeSocialHandle = (rawInput, field) => {
  const trimmedInput = sanitizeInput(rawInput);
  let handle = trimmedInput;

  if (field === "insta") {
    handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  }

  if (field === "tiktok") {
    handle = handle
      .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
      .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "");
  }

  return handle.replace(/^@+/, "").replace(/\/?$/, "").toLowerCase();
};

const isCancelInput = (message) => sanitizeInput(message).toLowerCase() === "batal";

const toTextInput = (input) => {
  if (typeof input === "string") {
    return { text: input, messageId: null };
  }

  if (input && typeof input === "object") {
    const text = input.body || input.text || input.message || "";
    const messageId = input.id?._serialized || input.id || null;
    return { text, messageId };
  }

  return { text: "", messageId: null };
};

const getUniqueFinder = (field, userModel) => {
  if (field === "insta") return userModel?.findUserByInsta;
  if (field === "tiktok") return userModel?.findUserByTiktok;
  return null;
};

export const userMenuHandlers = {
  async main(session, chatId, _message, waClient, _pool, userModel) {
    const me = await userModel?.findUserByWhatsApp?.(chatId.split("@")[0]);

    if (!me) {
      await waClient.sendMessage(
        chatId,
        [
          "Untuk menampilkan data Anda, silakan ketik NRP/NIP Anda (hanya angka).",
          "Ketik *batal* untuk keluar.",
          "",
          "Contoh:",
          "87020990",
        ].join("\n"),
      );
      session.step = "inputUserId";
      return;
    }

    if (!session.identityConfirmed) {
      await waClient.sendMessage(
        chatId,
        `Halo *${me.nama}*, apakah ini benar akun Anda? Balas *ya* / *tidak* atau *batal* untuk menutup sesi.`,
      );
      session.step = "confirmUserByWaIdentity";
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Balas *ya* jika ingin update data, *tidak* untuk kembali, atau *batal* untuk menutup sesi.",
    );
    session.step = "tanyaUpdateMyData";
  },

  async confirmUserByWaIdentity(session, chatId, message, waClient) {
    if (isCancelInput(message)) {
      session.exit = true;
      await waClient.sendMessage(chatId, SESSION_CLOSED_MESSAGE);
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Balas *ya* / *tidak* atau *batal* untuk menutup sesi.",
    );
  },

  async confirmUserByWaUpdate(session, chatId, message, waClient) {
    if (isCancelInput(message)) {
      session.exit = true;
      await waClient.sendMessage(chatId, SESSION_CLOSED_MESSAGE);
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Balas *ya* / *tidak* atau *batal* untuk menutup sesi.",
    );
  },

  async inputUserId(session, chatId, message, waClient, _pool, userModel) {
    const userId = sanitizeInput(message);
    if (!/^\d{6,18}$/.test(userId)) {
      await waClient.sendMessage(chatId, "❌ NRP/NIP harus terdiri dari 6-18 digit.");
      return;
    }

    const user = await userModel?.findUserById?.(userId);
    if (!user) {
      await waClient.sendMessage(
        chatId,
        `❌ NRP/NIP *${userId}* tidak ditemukan. Jika yakin benar, hubungi Opr Humas Polres Anda.`,
      );
      await waClient.sendMessage(
        chatId,
        "Silakan masukkan NRP/NIP lain atau ketik *batal* untuk keluar.",
      );
      session.step = "inputUserId";
      return;
    }

    session.bindUserId = user.user_id;
    session.step = "confirmBindUser";
    await waClient.sendMessage(
      chatId,
      `NRP/NIP *${user.user_id}* ditemukan. Lanjutkan proses pengaitan akun.`,
    );
  },

  async tanyaUpdateMyData(session, chatId, message, waClient) {
    if (isCancelInput(message)) {
      session.exit = true;
      await waClient.sendMessage(chatId, SESSION_CLOSED_MESSAGE);
      return;
    }

    await waClient.sendMessage(
      chatId,
      "Balas *ya* jika ingin update data, *tidak* untuk kembali, atau *batal* untuk menutup sesi.",
    );
  },

  async updateAskValue(session, chatId, inputMessage, waClient, _pool, userModel) {
    const { text, messageId } = toTextInput(inputMessage);
    const field = session.updateField;
    const pendingInput = normalizeSocialHandle(text, field);

    session.pendingInput = pendingInput;
    session.pendingInputMessageId = messageId;
    session.pendingInputAt = Date.now();

    const uniqueFinder = getUniqueFinder(field, userModel);
    if (uniqueFinder) {
      const existing = await uniqueFinder(pendingInput);
      if (existing && String(existing.user_id) !== String(session.updateUserId)) {
        const platformLabel = field === "insta" ? "Instagram" : "TikTok";
        await waClient.sendMessage(
          chatId,
          `❌ Akun ${platformLabel} tersebut sudah terdaftar pada pengguna lain.`,
        );
        return;
      }
    }

    const expectedSessionVersion = Number(session.sessionVersion || 0);
    let committedRow = null;

    if (typeof userModel?.updateUserFieldWithSessionVersion === "function") {
      const updateResult = await userModel.updateUserFieldWithSessionVersion({
        userId: session.updateUserId,
        field,
        value: pendingInput,
        expectedSessionVersion,
      });

      if (!updateResult || updateResult.versionMismatch) {
        await waClient.sendMessage(chatId, "⚠️ sesi sudah berubah, silakan ulangi");
        session.step = "tanyaUpdateMyData";
        await waClient.sendMessage(
          chatId,
          "Balas *ya* jika ingin update data, *tidak* untuk kembali, atau *batal* untuk menutup sesi.",
        );
        return;
      }

      committedRow = updateResult.user || updateResult.row || null;
      session.sessionVersion = Number(
        updateResult.sessionVersion ?? expectedSessionVersion + 1,
      );
    } else {
      await userModel.updateUserField(session.updateUserId, field, pendingInput);
      committedRow = await userModel.findUserById?.(session.updateUserId);
      session.sessionVersion = expectedSessionVersion + 1;
    }

    const committedValue = committedRow?.[field] ?? pendingInput;

    delete session.pendingInput;
    delete session.pendingInputMessageId;
    delete session.pendingInputAt;

    const formattedValue = ["insta", "tiktok"].includes(field)
      ? `@${committedValue}`
      : committedValue;

    await waClient.sendMessage(
      chatId,
      `✅ Data berhasil diperbarui menjadi *${formattedValue}*.`,
    );

    await this.main(session, chatId, "", waClient, _pool, userModel);
  },
};

export { SESSION_CLOSED_MESSAGE };

export default userMenuHandlers;
