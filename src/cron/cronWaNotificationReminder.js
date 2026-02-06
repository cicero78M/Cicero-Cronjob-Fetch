import waClient, { waGatewayClient, waUserClient } from "../service/waService.js";
import { sendWithClientFallback, formatToWhatsAppId } from "../utils/waHelper.js";
import { getActiveUsersWithWhatsapp } from "../model/userModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getPostsTodayByClient as getTiktokPostsToday } from "../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { findClientById } from "../service/clientService.js";
import { normalizeUsername as normalizeInsta } from "../utils/likesHelper.js";
import {
  deleteReminderStateForDate,
  getReminderStateMapForDate,
  upsertReminderState,
} from "../model/waNotificationReminderStateModel.js";

export const JOB_KEY = "./src/cron/cronWaNotificationReminder.js";
const TARGET_CLIENT_IDS = new Set(["DITBINMAS", "BIDHUMAS"]);

const THANK_YOU_MESSAGE =
  "Terimakasih, Tugas Likes dan komentar hari ini sudah dilaksanakan semua";
const DEFAULT_SEND_DELAY_MS = 2000;
const WHATSAPP_SEND_DELAY_MS =
  process.env.NODE_ENV === "test" ? 0 : DEFAULT_SEND_DELAY_MS;
const waFallbackClients = [
  { client: waGatewayClient, label: "WA-GATEWAY" },
  { client: waClient, label: "WA" },
  { client: waUserClient, label: "WA-USER" },
];

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildGreeting(user) {
  let hour = Number.parseInt(
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );

  if (Number.isNaN(hour)) hour = 8;

  let moment = "Malam";
  if (hour >= 4 && hour < 11) {
    moment = "Pagi";
  } else if (hour >= 11 && hour < 16) {
    moment = "Siang";
  }

  const pangkat = (user?.pangkat || user?.title || "").toString().trim();
  const nama = (user?.nama || user?.name || "").toString().trim();
  const pangkatNama = [pangkat, nama].filter(Boolean).join(" ").trim();
  const recipient = pangkatNama ? `Bapak/Ibu ${pangkatNama}` : "Bapak/Ibu";

  return `Selamat ${moment}, ${recipient}`;
}

function buildGenericNotificationMessage(user) {
  const greeting = buildGreeting(user);
  return (
    `${greeting}\n\n` +
    "👋 Pengingat engagement harian\n\n" +
    "1️⃣ Pastikan melaksanakan likes pada setiap unggahan.\n" +
    "2️⃣ Tambahkan komentar positif dan relevan pada konten terbaru.\n\n" +
    "Balas *notifwa#off* jika ingin berhenti menerima pengingat otomatis."
  );
}

function normalizeTiktok(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function extractTikTokUsernames(comments = []) {
  return (comments || [])
    .map((comment) => {
      if (typeof comment === "string") return comment;
      if (comment?.username) return comment.username;
      if (comment?.user?.unique_id) return comment.user.unique_id;
      return "";
    })
    .map(normalizeTiktok)
    .filter(Boolean);
}

async function getClientTaskRecap(clientId, cache) {
  if (!clientId) return null;
  if (cache.has(clientId)) return cache.get(clientId);

  const recap = {
    shortcodes: [],
    likesSets: [],
    tiktokPosts: [],
    commentSets: [],
    clientTiktokUsername: "",
  };

  try {
    const client = await findClientById(clientId);
    recap.clientTiktokUsername = normalizeTiktok(client?.client_tiktok);
  } catch (error) {
    console.error("Failed to fetch client info for recap", error);
  }

  try {
    recap.shortcodes = await getShortcodesTodayByClient(clientId);
  } catch (error) {
    console.error("Failed to get Instagram posts for recap", error);
    recap.shortcodes = [];
  }

  try {
    const likeLists = await Promise.all(
      recap.shortcodes.map((sc) => getLikesByShortcode(sc).catch(() => []))
    );
    recap.likesSets = likeLists.map(
      (likes) => new Set((likes || []).map(normalizeInsta))
    );
  } catch (error) {
    console.error("Failed to build likes recap", error);
    recap.likesSets = [];
  }

  try {
    recap.tiktokPosts = await getTiktokPostsToday(clientId);
  } catch (error) {
    console.error("Failed to get TikTok posts for recap", error);
    recap.tiktokPosts = [];
  }

  try {
    const commentLists = await Promise.all(
      recap.tiktokPosts.map((post) =>
        getCommentsByVideoId(post.video_id).catch(() => ({ comments: [] }))
      )
    );
    recap.commentSets = commentLists.map(
      (result) => new Set(extractTikTokUsernames(result?.comments))
    );
  } catch (error) {
    console.error("Failed to build TikTok comment recap", error);
    recap.commentSets = [];
  }

  cache.set(clientId, recap);
  return recap;
}

function buildUserTaskStatus(user, recap) {
  if (!recap) return null;
  const instaUsername = normalizeInsta(user?.insta);
  const tiktokUsername = normalizeTiktok(user?.tiktok);
  const incompleteIg = [];
  recap.shortcodes.forEach((sc, idx) => {
    const set = recap.likesSets[idx] || new Set();
    if (!instaUsername || !set.has(instaUsername)) {
      incompleteIg.push(`https://www.instagram.com/p/${sc}`);
    }
  });

  const incompleteTiktok = [];
  recap.tiktokPosts.forEach((post, idx) => {
    const set = recap.commentSets[idx] || new Set();
    if (!tiktokUsername || !set.has(tiktokUsername)) {
      const link = recap.clientTiktokUsername
        ? `https://www.tiktok.com/@${recap.clientTiktokUsername}/video/${post.video_id}`
        : `https://www.tiktok.com/video/${post.video_id}`;
      incompleteTiktok.push(link);
    }
  });

  return {
    incompleteIg,
    incompleteTiktok,
    allDone: incompleteIg.length === 0 && incompleteTiktok.length === 0,
  };
}

function buildNotificationMessage(user, status) {
  if (!status) return buildGenericNotificationMessage(user);

  const greeting = buildGreeting(user);
  if (status.allDone) return `${greeting}\n\n${THANK_YOU_MESSAGE}`;

  const lines = [greeting, "", "👋 Pengingat engagement harian", ""];

  if (status.incompleteIg.length) {
    lines.push("Konten Instagram yang perlu diselesaikan:");
    status.incompleteIg.forEach((link, idx) => {
      lines.push(`${idx + 1}. ${link}`);
    });
    lines.push("");
  }

  if (status.incompleteTiktok.length) {
    lines.push("Konten TikTok yang perlu diselesaikan:");
    status.incompleteTiktok.forEach((link, idx) => {
      lines.push(`${idx + 1}. ${link}`);
    });
    lines.push("");
  }

  lines.push("1️⃣ Pastikan setiap unggahan mendapat dukungan likes sesuai target.");
  lines.push("2️⃣ Tambahkan komentar positif dan relevan pada konten terbaru.");
  lines.push("");
  lines.push(
    "Balas *notifwa#off* jika ingin berhenti menerima pengingat otomatis."
  );

  return lines.join("\n");
}

function normalizeRecipient(whatsapp) {
  const digits = String(whatsapp ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return formatToWhatsAppId(digits);
}

function normalizeClientId(clientId) {
  return (clientId || "").toString().trim().toUpperCase();
}

function buildReminderStateKey(chatId, clientId) {
  if (!chatId || !clientId) return null;
  return `${chatId}:${normalizeClientId(clientId)}`;
}

const stageWeights = {
  initial: 0,
  followup1: 1,
  followup2: 2,
  completed: 3,
};

function getStageWeight(stage) {
  if (!stage) return -1;
  return stageWeights[stage] ?? -1;
}

function resolveRunStage(reminderStateMap) {
  if (!reminderStateMap?.size) return "initial";

  const pendingStates = Array.from(reminderStateMap.values()).filter(
    (state) => !state?.isComplete
  );

  if (!pendingStates.length) return null;

  const highestStage = Math.max(
    ...pendingStates.map((state) => getStageWeight(state?.lastStage))
  );

  if (highestStage < getStageWeight("followup1")) return "followup1";
  if (highestStage < getStageWeight("followup2")) return "followup2";
  return "followup2";
}

function determineRecipientStage(runStage, state) {
  if (!runStage) return null;
  if (!state) return "initial";
  if (state?.isComplete) return null;

  const runWeight = getStageWeight(runStage);
  const stateWeight = getStageWeight(state?.lastStage);

  if (runStage === "followup2" && runWeight >= stateWeight) return "followup2";
  if (runWeight > stateWeight) return runStage;
  return null;
}

function buildNextState(existingState, recipientStage, status) {
  const hasCompleted = Boolean(status?.allDone) || Boolean(existingState?.isComplete);
  const desiredStage = hasCompleted ? "completed" : recipientStage;
  const nextStage =
    getStageWeight(desiredStage) >= getStageWeight(existingState?.lastStage)
      ? desiredStage
      : existingState?.lastStage;

  return {
    lastStage: nextStage,
    isComplete: hasCompleted,
  };
}

export async function runCron() {
  const todayKey = getTodayKey();
  const reminderStateMap = await getReminderStateMapForDate(todayKey);
  const runStage = resolveRunStage(reminderStateMap) || "initial";
  const users = await getActiveUsersWithWhatsapp();
  const recipients = new Map();
  const recapCache = new Map();

  for (const user of users) {
    if (user?.wa_notification_opt_in !== true) continue;
    const clientId = normalizeClientId(user?.client_id);
    if (!TARGET_CLIENT_IDS.has(clientId)) continue;
    const chatId = normalizeRecipient(user?.whatsapp);
    const recipientKey = buildReminderStateKey(chatId, clientId);
    if (!chatId || !recipientKey || recipients.has(recipientKey)) continue;

    const state = reminderStateMap.get(recipientKey);
    const recipientStage = determineRecipientStage(runStage, state);
    if (!recipientStage) continue;

    const userWithPangkat = {
      ...user,
      pangkat: user?.pangkat ?? user?.title,
    };
    recipients.set(recipientKey, {
      user: userWithPangkat,
      stage: recipientStage,
      chatId,
      clientId,
    });
  }

  for (const [recipientKey, recipient] of recipients.entries()) {
    const { user, stage, chatId, clientId } = recipient;
    let message;
    let status;
    try {
      const recap = await getClientTaskRecap(clientId, recapCache);
      status = buildUserTaskStatus(user, recap);
      message = buildNotificationMessage(user, status);
    } catch (error) {
      console.error("Failed to build WA notification reminder", error);
      message = buildGenericNotificationMessage(user);
      status = null;
    }

    const sent = await sendWithClientFallback({
      chatId,
      message,
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: {
        jobKey: JOB_KEY,
        clientId,
        stage,
      },
    });
    if (!sent) {
      console.error(
        `[WA] Skip reminder state update for ${chatId} because message delivery failed.`
      );
      await delay(WHATSAPP_SEND_DELAY_MS);
      continue;
    }

    const nextState = buildNextState(
      reminderStateMap.get(recipientKey),
      stage,
      status
    );

    await upsertReminderState({
      dateKey: todayKey,
      chatId,
      clientId,
      lastStage: nextState.lastStage,
      isComplete: nextState.isComplete,
    });

    reminderStateMap.set(recipientKey, nextState);
    await delay(WHATSAPP_SEND_DELAY_MS);
  }
}

export async function resetNotificationReminderState() {
  const todayKey = getTodayKey();
  await deleteReminderStateForDate(todayKey);
}
