import { normalizeUsername } from "../../../utils/likesHelper.js";

export function computeDitbinmasLikesStats(
  users = [],
  likesSets = [],
  totalKonten = 0
) {
  const safeLikesSets = Array.isArray(likesSets) ? likesSets : [];

  const userStats = (users || []).map((user) => {
    if (!user || typeof user !== "object") return user;

    const base = { ...user, count: 0 };
    const insta = user.insta ? String(user.insta).trim() : "";

    if (!insta) {
      return { ...base, status: "noUsername" };
    }

    const username = normalizeUsername(insta);
    let count = 0;
    safeLikesSets.forEach((set) => {
      if (set && typeof set.has === "function" && set.has(username)) {
        count += 1;
      }
    });

    let status = "belum";
    if (totalKonten > 0) {
      if (count >= totalKonten) status = "lengkap";
      else if (count > 0) status = "kurang";
    }

    return { ...base, count, status };
  });

  const summary = userStats.reduce(
    (acc, user) => {
      if (!user || typeof user !== "object") return acc;

      acc.total += 1;
      switch (user.status) {
        case "noUsername":
          acc.noUsername += 1;
          break;
        case "lengkap":
          acc.lengkap += 1;
          break;
        case "kurang":
          acc.kurang += 1;
          break;
        default:
          acc.belum += 1;
          break;
      }
      return acc;
    },
    { total: 0, lengkap: 0, kurang: 0, belum: 0, noUsername: 0 }
  );

  return { userStats, summary };
}
