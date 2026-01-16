const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const WebSocket = require("ws");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const TOKEN_COOKIE = "token";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir, "numbergame.db"));

function nowIso() {
  return new Date().toISOString();
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");
  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      nickname TEXT,
      avatar_url TEXT,
      signature TEXT,
      created_at TEXT NOT NULL
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player1_id INTEGER,
      player2_id INTEGER,
      winner_id INTEGER,
      started_at TEXT,
      ended_at TEXT,
      dice_rolls TEXT,
      guesses TEXT,
      FOREIGN KEY(player1_id) REFERENCES users(id),
      FOREIGN KEY(player2_id) REFERENCES users(id),
      FOREIGN KEY(winner_id) REFERENCES users(id)
    )`
  );
  const columns = await all("PRAGMA table_info(users)");
  const columnNames = columns.map((col) => col.name);
  const addColumn = async (name, definition) => {
    if (!columnNames.includes(name)) {
      await run(`ALTER TABLE users ADD COLUMN ${definition}`);
    }
  };
  await addColumn("email", "email TEXT");
  await addColumn("phone", "phone TEXT");
  await addColumn("nickname", "nickname TEXT");
  await addColumn("avatar_url", "avatar_url TEXT");
  await addColumn("signature", "signature TEXT");
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    nickname: user.nickname || user.username,
    avatarUrl: user.avatar_url || "",
    signature: user.signature || "",
    createdAt: user.created_at,
  };
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function authRequired(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: "登录已过期" });
  }
}

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, email, phone } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "用户名和密码必填" });
      return;
    }
    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ error: "用户名长度需为3-20" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "密码至少6位" });
      return;
    }
    const existing = await get("SELECT id FROM users WHERE username = ?", [
      username,
    ]);
    if (existing) {
      res.status(409).json({ error: "用户名已存在" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = nowIso();
    await run(
      `INSERT INTO users (username, password_hash, email, phone, nickname, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, email || null, phone || null, username, createdAt]
    );
    const user = await get("SELECT * FROM users WHERE username = ?", [username]);
    const token = signToken(user);
    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: "注册失败" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "请输入用户名和密码" });
      return;
    }
    const user = await get("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) {
      res.status(401).json({ error: "账号或密码错误" });
      return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: "账号或密码错误" });
      return;
    }
    const token = signToken(user);
    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: "登录失败" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(TOKEN_COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", authRequired, async (req, res) => {
  const user = await get("SELECT * FROM users WHERE id = ?", [req.user.id]);
  res.json({ user: sanitizeUser(user) });
});

app.patch("/api/me", authRequired, async (req, res) => {
  try {
    const { nickname, email, phone, avatarUrl, signature } = req.body || {};
    await run(
      `UPDATE users SET nickname = ?, email = ?, phone = ?, avatar_url = ?, signature = ?
       WHERE id = ?`,
      [
        nickname || null,
        email || null,
        phone || null,
        avatarUrl || null,
        signature || null,
        req.user.id,
      ]
    );
    const user = await get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: "更新失败" });
  }
});

app.get("/api/history", authRequired, async (req, res) => {
  const rows = await all(
    `SELECT * FROM matches
     WHERE player1_id = ? OR player2_id = ?
     ORDER BY ended_at DESC
     LIMIT 50`,
    [req.user.id, req.user.id]
  );
  const data = rows.map((row) => ({
    id: row.id,
    roomCode: row.room_code,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    winnerId: row.winner_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    diceRolls: row.dice_rolls ? JSON.parse(row.dice_rolls) : [],
    guesses: row.guesses ? JSON.parse(row.guesses) : [],
  }));
  res.json({ matches: data });
});

const server = http.createServer(app);
server.keepAliveTimeout = 70 * 1000;
server.headersTimeout = 75 * 1000;
server.setTimeout(0);
const wss = new WebSocket.Server({ server });
const rooms = new Map();
const TURN_DURATION_MS = 60 * 1000;

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function ensureUniqueCode() {
  let code = makeCode();
  while (rooms.has(code)) {
    code = makeCode();
  }
  return code;
}

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload) {
  room.players.forEach((player) => {
    if (player && player.ws) {
      send(player.ws, payload);
    }
  });
  room.spectators.forEach((spectator) => {
    if (spectator && spectator.ws) {
      send(spectator.ws, payload);
    }
  });
}

function getRoomState(room) {
  if (!room.spectators) {
    room.spectators = [];
  }
  if (!room.history) {
    room.history = [];
  }
  const playersCount = room.players.filter(Boolean).length;
  let status = "waiting";
  if (room.winner !== null) {
    status = "finished";
  } else if (playersCount < 2) {
    status = "waiting";
  } else if (!room.secrets[0] || !room.secrets[1]) {
    status = "setting_secret";
  } else if (!room.started) {
    status = "ready_to_roll";
  } else {
    status = "in_progress";
  }
  room.status = status;
  return {
    code: room.code,
    playersCount,
    secretsSet: room.secrets.map((secret) => Boolean(secret)),
    currentTurn: room.currentTurn,
    winner: room.winner,
    lastResult: room.lastResult,
    dice: room.dice,
    status: room.status,
    spectatorsCount: room.spectators.length,
    history: room.history.slice(-12),
    turnDeadline: room.turnDeadline,
    players: room.players.map((player) =>
      player
        ? {
            id: player.userId,
            username: player.username,
            nickname: player.nickname,
            connected: Boolean(player.ws),
          }
        : null
    ),
  };
}

function resetRoom(room) {
  room.secrets = [null, null];
  room.currentTurn = null;
  room.winner = null;
  room.started = false;
  room.lastResult = null;
  room.dice = [null, null];
  room.diceHistory = [];
  room.history = [];
  room.startedAt = null;
  room.turnDeadline = null;
  room.status = "waiting";
  if (!room.spectators) {
    room.spectators = [];
  }
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function authenticateWs(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[TOKEN_COOKIE];
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function pushLog(room, message) {
  broadcast(room, { type: "log", message, at: Date.now() });
}

function closeSpectators(room) {
  room.spectators.forEach((spectator) => {
    if (spectator.ws && spectator.ws.readyState === WebSocket.OPEN) {
      spectator.ws.close(1000, "Room closed");
    }
  });
  room.spectators = [];
}

function hasConnectedPlayer(room) {
  return room.players.some(
    (player) => player && player.ws && player.ws.readyState === WebSocket.OPEN
  );
}

function clearRoomCleanup(room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
}

function scheduleRoomCleanup(room) {
  clearRoomCleanup(room);
  const ROOM_CLEANUP_MS = 30 * 60 * 1000;
  room.cleanupTimer = setTimeout(() => {
    if (!hasConnectedPlayer(room)) {
      closeSpectators(room);
      rooms.delete(room.code);
    }
  }, ROOM_CLEANUP_MS);
}

function cleanupRoomIfEmpty(room) {
  if (!hasConnectedPlayer(room)) {
    scheduleRoomCleanup(room);
    return true;
  }
  clearRoomCleanup(room);
  return false;
}

function handleDiceRoll(room, playerIndex) {
  if (room.winner !== null) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "对局已结束。",
    });
    return;
  }
  if (!room.players[0] || !room.players[1]) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "等待对手加入。",
    });
    return;
  }
  if (!room.secrets[0] || !room.secrets[1]) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "双方需先锁定秘密。",
    });
    return;
  }
  if (room.dice[playerIndex]) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "你已经掷过骰子。",
    });
    return;
  }
  room.dice[playerIndex] = Math.floor(Math.random() * 6) + 1;
  pushLog(room, `玩家${playerIndex + 1}掷出了 ${room.dice[playerIndex]}。`);
  broadcast(room, { type: "state", state: getRoomState(room) });
  if (!room.dice[0] || !room.dice[1]) {
    return;
  }
  room.diceHistory.push({
    p1: room.dice[0],
    p2: room.dice[1],
    at: nowIso(),
  });
  if (room.dice[0] === room.dice[1]) {
    pushLog(room, "双方点数相同，请重新掷骰子。");
    room.dice = [null, null];
    broadcast(room, { type: "state", state: getRoomState(room) });
    return;
  }
  room.currentTurn = room.dice[0] > room.dice[1] ? 0 : 1;
  room.turnDeadline = Date.now() + TURN_DURATION_MS;
  room.started = true;
  room.startedAt = nowIso();
  pushLog(room, `玩家${room.currentTurn + 1}先手。`);
  broadcast(room, { type: "state", state: getRoomState(room) });
}

async function saveMatch(room) {
  if (!room.players[0] || !room.players[1]) {
    return;
  }
  await run(
    `INSERT INTO matches (
      room_code,
      player1_id,
      player2_id,
      winner_id,
      started_at,
      ended_at,
      dice_rolls,
      guesses
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      room.code,
      room.players[0].userId,
      room.players[1].userId,
      room.players[room.winner]?.userId || null,
      room.startedAt,
      nowIso(),
      JSON.stringify(room.diceHistory),
      JSON.stringify(room.history),
    ]
  );
}

async function handleGuess(room, playerIndex, digits) {
  if (!room.started || room.winner !== null) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "对局未开始。",
    });
    return;
  }
  if (room.currentTurn !== playerIndex) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "还没轮到你。",
    });
    return;
  }
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponentSecret = room.secrets[opponentIndex];
  if (!opponentSecret) {
    send(room.players[playerIndex]?.ws, {
      type: "error",
      message: "对手未准备。",
    });
    return;
  }
  let correct = 0;
  for (let i = 0; i < 4; i += 1) {
    if (digits[i] === opponentSecret[i]) {
      correct += 1;
    }
  }
  room.lastResult = {
    by: playerIndex,
    guess: digits,
    correct,
  };
  room.history.push({
    by: playerIndex,
    guess: digits,
    correct,
    at: nowIso(),
  });
  if (correct === 4) {
    room.winner = playerIndex;
    room.turnDeadline = null;
  } else {
    room.currentTurn = opponentIndex;
    room.turnDeadline = Date.now() + TURN_DURATION_MS;
  }
  broadcast(room, { type: "state", state: getRoomState(room) });
  pushLog(
    room,
    `玩家${playerIndex + 1}猜了 ${digits.join("")}，位置正确 ${correct} 个。`
  );
  if (room.winner !== null) {
    pushLog(room, `玩家${room.winner + 1}获胜。`);
    await saveMatch(room);
  }
}

wss.on("connection", async (ws, req) => {
  try {
    ws.isAlive = true;
    ws.missedPongs = 0;
    ws.on("pong", () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });
    const payload = authenticateWs(req);
    if (!payload) {
      ws.close(1008, "Unauthorized");
      return;
    }
    let user = null;
    let userPromise = null;
    const ensureUser = async () => {
      if (user) {
        return user;
      }
      if (!userPromise) {
        userPromise = get("SELECT * FROM users WHERE id = ?", [payload.id]).then(
          (row) => {
            if (!row) {
              throw new Error("Unauthorized");
            }
            user = sanitizeUser(row);
            ws.user = user;
            return user;
          }
        );
      }
      return userPromise;
    };
    let joinedRoom = null;
    let playerIndex = null;
    let role = "player";
    let spectatorRef = null;

    ws.on("message", async (raw) => {
      ws.isAlive = true;
      ws.missedPongs = 0;
      let currentUser;
      try {
        currentUser = await ensureUser();
      } catch (error) {
        send(ws, { type: "error", message: "登录已失效，请重新登录。" });
        ws.close(1008, "Unauthorized");
        return;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        send(ws, { type: "error", message: "消息格式错误。" });
        return;
      }

      if (data.type === "create") {
        if (joinedRoom) {
          send(ws, { type: "error", message: "你已在房间中。" });
          return;
        }
        const code = ensureUniqueCode();
        const room = {
          code,
          players: [null, null],
          spectators: [],
          secrets: [null, null],
          currentTurn: null,
          turnDeadline: null,
          winner: null,
          started: false,
          lastResult: null,
          dice: [null, null],
          diceHistory: [],
          history: [],
          startedAt: null,
          status: "waiting",
        };
        rooms.set(code, room);
        room.players[0] = {
          ws,
          userId: currentUser.id,
          username: currentUser.username,
          nickname: currentUser.nickname || currentUser.username,
        };
        clearRoomCleanup(room);
        joinedRoom = room;
        playerIndex = 0;
        role = "player";
        send(ws, { type: "joined", code, playerIndex, role });
        send(ws, { type: "state", state: getRoomState(room) });
        pushLog(room, "玩家1创建了房间。");
        return;
      }

      if (data.type === "join") {
        if (joinedRoom) {
          send(ws, { type: "error", message: "你已在房间中。" });
          return;
        }
        const wantsSpectator = Boolean(data.spectator);
        const code = String(data.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: "error", message: "房间不存在。" });
          return;
        }
        if (!room.spectators) {
          room.spectators = [];
        }
        const existingIndex = room.players.findIndex(
          (player) => player && player.userId === currentUser.id
        );
        if (existingIndex !== -1) {
          playerIndex = existingIndex;
          role = "player";
        } else if (wantsSpectator) {
          role = "spectator";
        } else if (room.players[0] && room.players[1]) {
          role = "spectator";
          if (!data.spectator) {
            send(ws, { type: "error", message: "房间已满，可观战。" });
            return;
          }
        } else {
          playerIndex = room.players[0] ? 1 : 0;
          role = "player";
        }
        joinedRoom = room;
        if (role === "spectator") {
          const existingSpectator = room.spectators.find(
            (spectator) => spectator.userId === currentUser.id
          );
          if (existingSpectator) {
            existingSpectator.ws = ws;
            spectatorRef = existingSpectator;
          } else {
            spectatorRef = {
              ws,
              userId: currentUser.id,
              username: currentUser.username,
              nickname: currentUser.nickname || currentUser.username,
            };
            room.spectators.push(spectatorRef);
          }
          send(ws, { type: "joined", code, playerIndex: null, role });
          pushLog(room, `观战者${spectatorRef.nickname}进入房间。`);
          send(ws, { type: "state", state: getRoomState(room) });
        } else {
          const wasDisconnected = room.players[playerIndex] && !room.players[playerIndex].ws;
          room.players[playerIndex] = {
            ws,
            userId: currentUser.id,
            username: currentUser.username,
            nickname: currentUser.nickname || currentUser.username,
          };
          clearRoomCleanup(room);
          send(ws, { type: "joined", code, playerIndex, role });
          if (wasDisconnected) {
            pushLog(room, `玩家${playerIndex + 1}已重连。`);
          } else {
            pushLog(room, `玩家${playerIndex + 1}加入房间。`);
          }
          broadcast(room, { type: "state", state: getRoomState(room) });
        }
        return;
      }

      if (!joinedRoom) {
        send(ws, { type: "error", message: "请先加入房间。" });
        return;
      }

      if (
        playerIndex === null &&
        ["set_secret", "guess", "roll_dice", "reset"].includes(data.type)
      ) {
        send(ws, { type: "error", message: "观战模式无法操作。" });
        return;
      }

      if (data.type === "set_secret") {
        const digits = Array.isArray(data.digits)
          ? data.digits.map((d) => Number.parseInt(d, 10))
          : [];
        if (
          digits.length !== 4 ||
          digits.some((d) => !Number.isInteger(d) || d < 0 || d > 9)
        ) {
          send(ws, { type: "error", message: "秘密必须是4位数字。" });
          return;
        }
        if (joinedRoom.secrets[playerIndex]) {
          send(ws, { type: "error", message: "秘密已锁定，无法更改。" });
          return;
        }
        joinedRoom.secrets[playerIndex] = digits;
        broadcast(joinedRoom, { type: "state", state: getRoomState(joinedRoom) });
        pushLog(joinedRoom, `玩家${playerIndex + 1}已锁定秘密。`);
        return;
      }

      if (data.type === "guess") {
        const digits = Array.isArray(data.digits)
          ? data.digits.map((d) => Number.parseInt(d, 10))
          : [];
        if (
          digits.length !== 4 ||
          digits.some((d) => !Number.isInteger(d) || d < 0 || d > 9)
        ) {
          send(ws, { type: "error", message: "猜测必须是4位数字。" });
          return;
        }
        try {
          await handleGuess(joinedRoom, playerIndex, digits);
        } catch (error) {
          send(ws, { type: "error", message: "服务器错误。" });
        }
        return;
      }

      if (data.type === "roll_dice") {
        handleDiceRoll(joinedRoom, playerIndex);
        return;
      }

      if (data.type === "reset") {
        resetRoom(joinedRoom);
        broadcast(joinedRoom, { type: "state", state: getRoomState(joinedRoom) });
        pushLog(joinedRoom, "对局已重置。");
        return;
      }

      send(ws, { type: "error", message: "未知操作。" });
    });

    ws.on("close", () => {
      if (!joinedRoom) {
        return;
      }
      if (role === "spectator") {
        joinedRoom.spectators = joinedRoom.spectators.filter(
          (spectator) => spectator !== spectatorRef
        );
        cleanupRoomIfEmpty(joinedRoom);
        return;
      }
      if (joinedRoom.players[playerIndex]?.ws === ws) {
        joinedRoom.players[playerIndex].ws = null;
      }
      pushLog(joinedRoom, `玩家${playerIndex + 1}离线，等待重连。`);
      broadcast(joinedRoom, { type: "state", state: getRoomState(joinedRoom) });
      cleanupRoomIfEmpty(joinedRoom);
    });
  } catch (error) {
    ws.close(1011, "Server error");
  }
});

app.get("/api/rooms", authRequired, (req, res) => {
  const list = Array.from(rooms.values()).map((room) => ({
    code: room.code,
    playersCount: room.players.filter(Boolean).length,
    spectatorsCount: room.spectators ? room.spectators.length : 0,
    status: getRoomState(room).status,
  }));
  res.json({ rooms: list });
});

const HEARTBEAT_INTERVAL_MS = 45000;
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.missedPongs = (ws.missedPongs || 0) + 1;
      if (ws.missedPongs >= 3) {
        ws.terminate();
      }
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

const TURN_TICK_MS = 1000;
const turnTimer = setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    if (!room.started || room.winner !== null) {
      return;
    }
    if (room.currentTurn === null || !room.turnDeadline) {
      return;
    }
    if (now < room.turnDeadline) {
      return;
    }
    const previous = room.currentTurn;
    const next = previous === 0 ? 1 : 0;
    room.currentTurn = next;
    room.turnDeadline = now + TURN_DURATION_MS;
    pushLog(room, `玩家${previous + 1}超时，轮到玩家${next + 1}。`);
    broadcast(room, { type: "state", state: getRoomState(room) });
  });
}, TURN_TICK_MS);

server.on("close", () => {
  clearInterval(heartbeat);
  clearInterval(turnTimer);
});

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
