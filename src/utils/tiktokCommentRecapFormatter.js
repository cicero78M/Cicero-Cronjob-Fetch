// src/utils/tiktokCommentRecapFormatter.js
/**
 * Format TikTok comment recap data into a richer payload that frontends can render directly.
 * This adds UX-friendly metadata such as progress percentages, status labels,
 * insight summaries, and chart helper data while keeping backward compatible fields.
 *
 * @param {Array<Object>} rowsInput
 * @param {number} totalPostsInput
 * @returns {Object}
 */
export function formatTiktokCommentRecapResponse(rowsInput, totalPostsInput) {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const totalPostsFromRows = rows.length > 0 ? Number(rows[0]?.total_konten) : 0;
  const totalPostsNumber = Number.isFinite(Number(totalPostsInput))
    ? Number(totalPostsInput)
    : totalPostsFromRows;
  const totalPosts = totalPostsNumber > 0 ? totalPostsNumber : 0;

  const perRowHeight = 36;
  const minChartHeight = 320;
  const processedRows = [];
  const sudahUsers = [];
  const kurangUsers = [];
  const belumUsers = [];
  const noUsernameUsersDetails = [];
  const chartData = [];
  const distribution = {
    sudah: 0,
    kurang: 0,
    belum: 0,
    noUsername: 0,
    noPosts: 0,
  };

  let totalComments = 0;
  let activeCompletionSum = 0;
  let activeUserCount = 0;
  let participatingUsers = 0;

  rows.forEach((user, index) => {
    const commentsNumber = Number.isFinite(Number(user?.jumlah_komentar))
      ? Number(user.jumlah_komentar)
      : 0;
    totalComments += commentsNumber;

    const trimmedUsername =
      typeof user?.username === "string" ? user.username.trim() : "";
    const hasUsername = trimmedUsername.length > 0;

    const completionRate = totalPosts > 0 ? commentsNumber / totalPosts : 0;
    const completionPercentage = totalPosts > 0
      ? Math.round(completionRate * 100)
      : 0;
    const missingComments = totalPosts > 0
      ? Math.max(totalPosts - commentsNumber, 0)
      : 0;

    let status;
    if (totalPosts === 0) {
      status = hasUsername ? "no_posts" : "no_username";
    } else if (!hasUsername) {
      status = "no_username";
    } else if (commentsNumber >= totalPosts) {
      status = "sudah";
    } else if (commentsNumber > 0) {
      status = "kurang";
    } else {
      status = "belum";
    }

    if (totalPosts > 0 && status !== "no_username" && status !== "no_posts") {
      activeCompletionSum += completionRate;
      activeUserCount += 1;
      if (["sudah", "kurang"].includes(status)) {
        participatingUsers += 1;
      }
    }

    const badges = [];
    if (status === "sudah") {
      badges.push("✅ Semua konten pada periode ini sudah dikomentari.");
    }
    if (status === "kurang") {
      badges.push("⚠️ Masih ada konten yang belum dikomentari.");
    }
    if (status === "belum") {
      badges.push("⏳ Belum ada komentar pada periode ini.");
    }
    if (status === "no_posts") {
      badges.push("ℹ️ Tidak ada konten yang perlu dikomentari pada periode ini.");
    }
    if (!hasUsername) {
      badges.push("❗ Username TikTok belum tersedia.");
    }

    const processedUser = {
      ...user,
      username: hasUsername ? trimmedUsername : user?.username ?? null,
      jumlah_komentar: commentsNumber,
      ranking: index + 1,
      completionRate,
      completionPercentage,
      missingComments,
      status,
      badges,
    };

    processedRows.push(processedUser);

    switch (status) {
      case "sudah":
        distribution.sudah += 1;
        sudahUsers.push(processedUser.username);
        break;
      case "kurang":
        distribution.kurang += 1;
        kurangUsers.push(processedUser.username);
        break;
      case "belum":
        distribution.belum += 1;
        belumUsers.push(processedUser.username);
        break;
      case "no_username":
        distribution.noUsername += 1;
        noUsernameUsersDetails.push({
          userId: user?.user_id ?? null,
          name: user?.nama ?? null,
          division: user?.divisi ?? null,
          clientId: user?.client_id ?? null,
          regionalId: user?.regional_id ?? null,
        });
        break;
      case "no_posts":
        distribution.noPosts += 1;
        break;
      default:
        break;
    }

    const labelCandidate =
      user?.nama ||
      user?.title ||
      (hasUsername ? trimmedUsername : null) ||
      `Pengguna ${index + 1}`;

    chartData.push({
      label: labelCandidate,
      comments: commentsNumber,
      missingComments,
      completionPercentage,
    });
  });

  const chartHeight = Math.max(processedRows.length * perRowHeight, minChartHeight);
  const belumUsersCount = belumUsers.length + noUsernameUsersDetails.length;
  const noUsernameUsers = noUsernameUsersDetails.map(() => null);

  const averageCompletionPercentage =
    activeUserCount > 0 && totalPosts > 0
      ? Number(((activeCompletionSum / activeUserCount) * 100).toFixed(1))
      : 0;
  const participationRatePercentage =
    activeUserCount > 0
      ? Number(((participatingUsers / activeUserCount) * 100).toFixed(1))
      : 0;

  const summary = {
    totalPosts,
    totalUsers: processedRows.length,
    totalComments,
    averageCompletionPercentage,
    participationRatePercentage,
    distribution,
  };

  const insights = [];
  if (distribution.sudah > 0) {
    insights.push(
      `✅ ${distribution.sudah} akun sudah mengomentari semua konten yang tersedia.`
    );
  }
  if (distribution.kurang > 0) {
    insights.push(
      `⚠️ ${distribution.kurang} akun masih kekurangan komentar pada sebagian konten.`
    );
  }
  if (distribution.belum > 0) {
    insights.push(`⏳ ${distribution.belum} akun belum memberikan komentar sama sekali.`);
  }
  if (distribution.noUsername > 0) {
    insights.push(`❗ ${distribution.noUsername} akun belum memiliki username TikTok.`);
  }
  if (distribution.noPosts > 0) {
    insights.push("ℹ️ Tidak ada konten pada periode ini.");
  }

  const statusLegend = [
    {
      status: "sudah",
      label: "Sudah",
      description: "Semua konten pada periode ini telah dikomentari.",
    },
    {
      status: "kurang",
      label: "Kurang",
      description: "Sudah memberikan komentar tetapi masih ada konten yang belum dikomentari.",
    },
    {
      status: "belum",
      label: "Belum",
      description: "Belum memberikan komentar pada periode ini.",
    },
    {
      status: "no_username",
      label: "No Username",
      description: "Belum memiliki username TikTok di sistem.",
    },
    {
      status: "no_posts",
      label: "No Posts",
      description: "Tidak ada konten untuk periode yang dipilih.",
    },
  ];

  return {
    data: processedRows,
    chartHeight,
    totalPosts,
    sudahUsers,
    kurangUsers,
    belumUsers,
    sudahUsersCount: sudahUsers.length,
    kurangUsersCount: kurangUsers.length,
    belumUsersCount,
    noUsernameUsersCount: noUsernameUsersDetails.length,
    noUsernameUsers,
    usersCount: processedRows.length,
    summary,
    chartData,
    insights,
    statusLegend,
    noUsernameUsersDetails,
  };
}
