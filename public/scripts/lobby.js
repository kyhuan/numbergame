const nicknameEl = document.getElementById("nickname");
const signatureEl = document.getElementById("signature");
const avatarPreview = document.getElementById("avatarPreview");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomCodeInput = document.getElementById("roomCode");
const roomList = document.getElementById("roomList");
const historyList = document.getElementById("historyList");
const logoutBtn = document.getElementById("logoutBtn");

const statusLabels = {
  waiting: "等待中",
  setting_secret: "设置秘密",
  ready_to_roll: "等待掷骰子",
  in_progress: "进行中",
  finished: "已结束",
};

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function renderRooms(rooms) {
  roomList.innerHTML = "";
  if (!rooms.length) {
    roomList.textContent = "暂无公开房间。";
    return;
  }
  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "room-item";
    const canJoin = room.playersCount < 2;
    const actionLabel = canJoin ? "加入" : "观战";
    item.innerHTML = `
      <div>
        <strong>房间 ${room.code}</strong>
        <div class="muted">人数 ${room.playersCount} · 状态 ${
          statusLabels[room.status] || room.status
        } · 观战 ${room.spectatorsCount || 0}</div>
      </div>
      <button class="btn ghost" data-code="${room.code}">${actionLabel}</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      const query = canJoin ? "" : "&spectator=1";
      location.href = `game.html?code=${room.code}${query}`;
    });
    roomList.appendChild(item);
  });
}

function renderHistory(matches, userId) {
  historyList.innerHTML = "";
  if (!matches.length) {
    historyList.textContent = "暂无对局记录。";
    return;
  }
  matches.slice(0, 8).forEach((match) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const win = match.winnerId === userId;
    item.innerHTML = `
      <strong>${win ? "胜利" : "失败"}</strong>
      <div class="muted">房间 ${match.roomCode} · ${formatTime(match.endedAt)}</div>
      <div class="muted">掷骰子回合 ${match.diceRolls.length}</div>
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

async function loadLobby() {
  const user = await requireAuth();
  if (!user) {
    return;
  }
  nicknameEl.textContent = user.nickname || user.username;
  signatureEl.textContent = user.signature || "准备开局？创建房间或加入好友。";
  renderAvatar(user.nickname || user.username, user.avatarUrl || "");
  const historyData = await fetchJson("/api/history");
  renderHistory(historyData.matches || [], user.id);
  async function refreshRooms() {
    try {
      const roomsData = await fetchJson("/api/rooms");
      renderRooms(roomsData.rooms || []);
    } catch (error) {
      roomList.textContent = "房间列表暂时不可用。";
    }
  }
  await refreshRooms();
  setInterval(refreshRooms, 8000);
}

createRoomBtn.addEventListener("click", () => {
  location.href = "game.html?create=1";
});

joinRoomBtn.addEventListener("click", () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    roomCodeInput.focus();
    return;
  }
  roomCodeInput.value = code;
  location.href = `game.html?code=${code}`;
});

logoutBtn.addEventListener("click", () => {
  logout();
});

loadLobby();
