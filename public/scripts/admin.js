const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const adminUser = document.getElementById("adminUser");
const adminPass = document.getElementById("adminPass");
const adminLogin = document.getElementById("adminLogin");
const adminNotice = document.getElementById("adminNotice");
const adminLogout = document.getElementById("adminLogout");
const broadcastInput = document.getElementById("broadcastInput");
const broadcastBtn = document.getElementById("broadcastBtn");
const userSearch = document.getElementById("userSearch");
const userSearchBtn = document.getElementById("userSearchBtn");
const userList = document.getElementById("userList");
const announcementTitle = document.getElementById("announcementTitle");
const announcementBody = document.getElementById("announcementBody");
const announcementActive = document.getElementById("announcementActive");
const announcementCreate = document.getElementById("announcementCreate");
const announcementList = document.getElementById("announcementList");
const matchList = document.getElementById("matchList");
const roomList = document.getElementById("roomList");
const adminLogs = document.getElementById("adminLogs");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function showDashboard() {
  loginCard.hidden = true;
  dashboard.hidden = false;
}

function showLogin() {
  loginCard.hidden = false;
  dashboard.hidden = true;
}

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

async function loadUsers(query = "") {
  const data = await fetchJson(`/admin/users?query=${encodeURIComponent(query)}`);
  userList.innerHTML = "";
  data.users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <strong>${user.username} ${user.nickname ? `· ${user.nickname}` : ""}</strong>
      <div class="admin-meta">状态: ${user.status || "active"} · ${formatTime(
        user.created_at
      )}</div>
      <div class="admin-actions">
        <button class="btn ghost" data-action="ban">禁用</button>
        <button class="btn ghost" data-action="unban">解禁</button>
        <button class="btn ghost" data-action="reset">重置密码</button>
      </div>
    `;
    item.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "ban" || action === "unban") {
          await fetchJson(`/admin/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: action === "ban" ? "banned" : "active",
              nickname: user.nickname,
              signature: user.signature,
            }),
          });
          await loadUsers(userSearch.value.trim());
        }
        if (action === "reset") {
          const password = prompt("新密码（至少6位）");
          if (!password) {
            return;
          }
          await fetchJson(`/admin/users/${user.id}/reset_password`, {
            method: "POST",
            body: JSON.stringify({ password }),
          });
          alert("密码已更新");
        }
      });
    });
    userList.appendChild(item);
  });
}

async function loadAnnouncements() {
  const data = await fetchJson("/admin/announcements");
  announcementList.innerHTML = "";
  data.announcements.forEach((announcement) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <strong>${announcement.title}</strong>
      <div class="admin-meta">${announcement.body}</div>
      <div class="admin-meta">状态: ${announcement.active ? "启用" : "关闭"} · ${
        announcement.created_at
      }</div>
      <div class="admin-actions">
        <button class="btn ghost" data-action="toggle">
          ${announcement.active ? "关闭" : "启用"}
        </button>
        <button class="btn ghost" data-action="delete">删除</button>
      </div>
    `;
    item.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await fetchJson(`/admin/announcements/${announcement.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: announcement.title,
          body: announcement.body,
          active: announcement.active ? 0 : 1,
        }),
      });
      await loadAnnouncements();
    });
    item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      await fetchJson(`/admin/announcements/${announcement.id}`, {
        method: "DELETE",
      });
      await loadAnnouncements();
    });
    announcementList.appendChild(item);
  });
}

async function loadMatches() {
  const data = await fetchJson("/admin/matches");
  matchList.innerHTML = "";
  data.matches.forEach((match) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <strong>房间 ${match.room_code}</strong>
      <div class="admin-meta">玩家: ${match.p1_name || "-"} vs ${
      match.p2_name || "-"
    } · 胜者: ${match.winner_name || "-"}</div>
      <div class="admin-meta">${formatTime(match.ended_at)}</div>
      <div class="admin-actions">
        <button class="btn ghost" data-action="delete">删除</button>
      </div>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      await fetchJson(`/admin/matches/${match.id}`, { method: "DELETE" });
      await loadMatches();
    });
    matchList.appendChild(item);
  });
}

async function loadRooms() {
  const data = await fetchJson("/admin/rooms");
  roomList.innerHTML = "";
  data.rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <strong>房间 ${room.code}</strong>
      <div class="admin-meta">人数 ${room.playersCount} · 观战 ${
      room.spectatorsCount
    } · 状态 ${room.status}</div>
      <div class="admin-actions">
        <button class="btn ghost">关闭房间</button>
      </div>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      await fetchJson(`/admin/rooms/${room.code}/close`, { method: "POST" });
      await loadRooms();
    });
    roomList.appendChild(item);
  });
}

async function loadLogs() {
  const data = await fetchJson("/admin/logs");
  adminLogs.innerHTML = "";
  data.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <strong>${log.admin_name}</strong>
      <div class="admin-meta">${log.action} · ${log.detail || ""}</div>
      <div class="admin-meta">${log.created_at}</div>
    `;
    adminLogs.appendChild(item);
  });
}

async function loadAll() {
  await Promise.all([
    loadUsers(),
    loadAnnouncements(),
    loadMatches(),
    loadRooms(),
    loadLogs(),
  ]);
}

adminLogin.addEventListener("click", async () => {
  adminNotice.textContent = "";
  try {
    await fetchJson("/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: adminUser.value.trim(),
        password: adminPass.value,
      }),
    });
    showDashboard();
    await loadAll();
  } catch (error) {
    adminNotice.textContent = error.message;
  }
});

adminLogout.addEventListener("click", async () => {
  await fetchJson("/admin/logout", { method: "POST" });
  showLogin();
});

broadcastBtn.addEventListener("click", async () => {
  const message = broadcastInput.value.trim();
  if (!message) {
    return;
  }
  await fetchJson("/admin/broadcast", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  broadcastInput.value = "";
});

userSearchBtn.addEventListener("click", async () => {
  await loadUsers(userSearch.value.trim());
});

announcementCreate.addEventListener("click", async () => {
  const title = announcementTitle.value.trim();
  const body = announcementBody.value.trim();
  if (!title || !body) {
    return;
  }
  await fetchJson("/admin/announcements", {
    method: "POST",
    body: JSON.stringify({
      title,
      body,
      active: announcementActive.checked ? 1 : 0,
    }),
  });
  announcementTitle.value = "";
  announcementBody.value = "";
  await loadAnnouncements();
});

async function init() {
  try {
    await fetchJson("/admin/me");
    showDashboard();
    await loadAll();
  } catch (error) {
    showLogin();
  }
}

init();
