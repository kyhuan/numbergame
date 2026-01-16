const nicknameInput = document.getElementById("nickname");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const avatarInput = document.getElementById("avatarUrl");
const signatureInput = document.getElementById("signature");
const avatarPreview = document.getElementById("avatarPreview");
const saveProfileBtn = document.getElementById("saveProfile");
const profileNotice = document.getElementById("profileNotice");
const statGrid = document.getElementById("statGrid");
const historyList = document.getElementById("historyList");
const logoutBtn = document.getElementById("logoutBtn");

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function renderStats(matches, userId) {
  const total = matches.length;
  const wins = matches.filter((m) => m.winnerId === userId).length;
  const losses = total - wins;
  const winRate = total ? `${Math.round((wins / total) * 100)}%` : "0%";
  statGrid.innerHTML = `
    <div class="stat">
      <div class="muted">总对局</div>
      <strong>${total}</strong>
    </div>
    <div class="stat">
      <div class="muted">胜场</div>
      <strong>${wins}</strong>
    </div>
    <div class="stat">
      <div class="muted">败场</div>
      <strong>${losses}</strong>
    </div>
    <div class="stat">
      <div class="muted">胜率</div>
      <strong>${winRate}</strong>
    </div>
  `;
}

function renderHistory(matches, userId) {
  historyList.innerHTML = "";
  if (!matches.length) {
    historyList.textContent = "暂无对局记录。";
    return;
  }
  matches.slice(0, 10).forEach((match) => {
    const win = match.winnerId === userId;
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${win ? "胜利" : "失败"}</strong>
      <div class="muted">房间 ${match.roomCode} · ${formatTime(match.endedAt)}</div>
      <div class="muted">掷骰子回合 ${match.diceRolls.length} · 猜测 ${match.guesses.length} 次</div>
    `;
    historyList.appendChild(item);
  });
}

function renderAvatar(nickname, avatarUrl) {
  avatarPreview.innerHTML = "";
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = nickname || "avatar";
    avatarPreview.appendChild(img);
    return;
  }
  const fallback = document.createElement("span");
  fallback.textContent = (nickname || "玩").slice(0, 1);
  avatarPreview.appendChild(fallback);
}

async function loadProfile() {
  const user = await requireAuth();
  if (!user) {
    return;
  }
  nicknameInput.value = user.nickname || "";
  emailInput.value = user.email || "";
  phoneInput.value = user.phone || "";
  avatarInput.value = user.avatarUrl || "";
  signatureInput.value = user.signature || "";
  renderAvatar(user.nickname || user.username, user.avatarUrl || "");
  const historyData = await fetchJson("/api/history");
  renderStats(historyData.matches || [], user.id);
  renderHistory(historyData.matches || [], user.id);
}

saveProfileBtn.addEventListener("click", async () => {
  profileNotice.textContent = "";
  try {
    await fetchJson("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        nickname: nicknameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
        avatarUrl: avatarInput.value.trim(),
        signature: signatureInput.value.trim(),
      }),
    });
    profileNotice.textContent = "资料已更新。";
    renderAvatar(nicknameInput.value.trim(), avatarInput.value.trim());
  } catch (error) {
    profileNotice.textContent = error.message;
  }
});

avatarInput.addEventListener("input", () => {
  renderAvatar(nicknameInput.value.trim(), avatarInput.value.trim());
});

nicknameInput.addEventListener("input", () => {
  renderAvatar(nicknameInput.value.trim(), avatarInput.value.trim());
});

logoutBtn.addEventListener("click", () => {
  logout();
});

loadProfile();
