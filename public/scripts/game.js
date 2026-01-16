const roomCodeLabel = document.getElementById("roomCode");
const roomStatus = document.getElementById("roomStatus");
const playerLabel = document.getElementById("playerLabel");
const diceP1 = document.getElementById("diceP1");
const diceP2 = document.getElementById("diceP2");
const rollDiceButton = document.getElementById("rollDice");
const lockSecretButton = document.getElementById("lockSecret");
const submitGuessButton = document.getElementById("submitGuess");
const resetButton = document.getElementById("resetGame");
const secretStatus = document.getElementById("secretStatus");
const turnStatus = document.getElementById("turnStatus");
const turnTimer = document.getElementById("turnTimer");
const logContainer = document.getElementById("log");
const logoutBtn = document.getElementById("logoutBtn");
const recentGuessesEl = document.getElementById("recentGuesses");

const secretInputs = Array.from(document.querySelectorAll("#secretRow .digit"));
const guessInputs = Array.from(document.querySelectorAll("#guessRow .digit"));

let socket = null;
let playerIndex = null;
let currentState = null;
let role = "player";
let selfUser = null;
let joinRequest = null;
let lastRoomCode = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let timerInterval = null;

rollDiceButton.disabled = true;
submitGuessButton.disabled = true;

const statusLabels = {
  waiting: "等待中",
  setting_secret: "设置秘密",
  ready_to_roll: "等待掷骰子",
  in_progress: "进行中",
  finished: "已结束",
};

function formatTime(value) {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function logMessage(message, at) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const time = document.createElement("div");
  time.className = "log-time";
  time.textContent = formatTime(at || Date.now());
  const text = document.createElement("div");
  text.textContent = message;
  entry.appendChild(time);
  entry.appendChild(text);
  logContainer.prepend(entry);
}

function collectDigits(inputs) {
  return inputs.map((input) => Number.parseInt(input.value, 10));
}

function digitsValid(digits) {
  return digits.length === 4 && digits.every((d) => Number.isInteger(d) && d >= 0 && d <= 9);
}

function setInputsDisabled(inputs, disabled) {
  inputs.forEach((input) => {
    input.disabled = disabled;
  });
}

function renderRecentGuesses() {
  if (!recentGuessesEl) {
    return;
  }
  recentGuessesEl.innerHTML = "";
  if (!currentState || role === "spectator" || playerIndex === null) {
    recentGuessesEl.textContent = "暂无记录。";
    return;
  }
  const history = currentState.history || [];
  const mine = history.filter((entry) => entry.by === playerIndex);
  const recent = mine.slice(-4);
  if (!recent.length) {
    recentGuessesEl.textContent = "暂无记录。";
    return;
  }
  recent.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "guess-item";
    if (entry.correct === 4) {
      item.classList.add("hit");
    }
    const time = entry.at ? formatTime(entry.at) : "--:--:--";
    item.innerHTML = `
      <strong>${entry.guess.join("")}</strong>
      <span class="guess-right">
        <span class="guess-score">${entry.correct} 正确</span>
        <span class="log-time">${time}</span>
      </span>
    `;
    recentGuessesEl.appendChild(item);
  });
}

function updateTurnTimer() {
  if (!turnTimer) {
    return;
  }
  if (!currentState || currentState.currentTurn === null || !currentState.turnDeadline) {
    turnTimer.textContent = "--";
    return;
  }
  const remainingMs = currentState.turnDeadline - Date.now();
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  turnTimer.textContent = `剩余 ${seconds}s`;
}

function ensureTimerInterval() {
  if (timerInterval) {
    return;
  }
  timerInterval = setInterval(updateTurnTimer, 1000);
}

function renderState() {
  if (!currentState) {
    return;
  }
  ensureTimerInterval();
  roomStatus.textContent =
    statusLabels[currentState.status] || currentState.status;
  if (role === "spectator") {
    playerLabel.textContent = "观战";
    secretStatus.textContent = "观战中";
    turnStatus.textContent = "观战中";
    rollDiceButton.disabled = true;
    lockSecretButton.disabled = true;
    submitGuessButton.disabled = true;
    setInputsDisabled(secretInputs, true);
    setInputsDisabled(guessInputs, true);
    diceP1.textContent = currentState.dice?.[0] || "-";
    diceP2.textContent = currentState.dice?.[1] || "-";
    renderRecentGuesses();
    updateTurnTimer();
    return;
  }
  if (playerIndex === null) {
    return;
  }
  const mySecretSet = currentState.secretsSet?.[playerIndex];
  const opponentSecretSet =
    currentState.secretsSet?.[playerIndex === 0 ? 1 : 0];

  if (mySecretSet) {
    secretStatus.textContent = "已锁定";
    setInputsDisabled(secretInputs, true);
    lockSecretButton.disabled = true;
  } else {
    secretStatus.textContent = "未准备";
    setInputsDisabled(secretInputs, false);
    lockSecretButton.disabled = false;
  }

  diceP1.textContent = currentState.dice?.[0] || "-";
  diceP2.textContent = currentState.dice?.[1] || "-";

  const canRoll =
    currentState.status === "ready_to_roll" && !currentState.dice?.[playerIndex];
  rollDiceButton.disabled = !canRoll;

  if (currentState.winner !== null) {
    turnStatus.textContent =
      currentState.winner === playerIndex ? "你赢了!" : "你输了。";
    submitGuessButton.disabled = true;
    setInputsDisabled(guessInputs, true);
    renderRecentGuesses();
    updateTurnTimer();
    return;
  }

  if (currentState.currentTurn === null) {
    if (currentState.playersCount < 2) {
      turnStatus.textContent = "等待对手加入";
    } else if (!opponentSecretSet) {
      turnStatus.textContent = "对手设置秘密中";
    } else if (currentState.status === "ready_to_roll") {
      turnStatus.textContent = "等待掷骰子";
    } else {
      turnStatus.textContent = "掷骰子中...";
    }
    submitGuessButton.disabled = true;
    setInputsDisabled(guessInputs, true);
    renderRecentGuesses();
    updateTurnTimer();
    return;
  }

  if (currentState.currentTurn === playerIndex) {
    turnStatus.textContent = "轮到你猜";
    submitGuessButton.disabled = false;
    setInputsDisabled(guessInputs, false);
  } else {
    turnStatus.textContent = "轮到对手";
    submitGuessButton.disabled = true;
    setInputsDisabled(guessInputs, true);
  }
  renderRecentGuesses();
  updateTurnTimer();
}

function autoAdvance(inputs) {
  inputs.forEach((input, index) => {
    input.addEventListener("focus", (event) => {
      event.target.select();
    });
    input.addEventListener("input", (event) => {
      const digits = event.target.value.replace(/[^0-9]/g, "");
      const value = digits ? digits[digits.length - 1] : "";
      event.target.value = value;
      if (value && inputs[index + 1]) {
        inputs[index + 1].focus();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value && inputs[index - 1]) {
        inputs[index - 1].focus();
      }
      if (event.key === "ArrowLeft" && inputs[index - 1]) {
        inputs[index - 1].focus();
      }
      if (event.key === "ArrowRight" && inputs[index + 1]) {
        inputs[index + 1].focus();
      }
    });
  });
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    logMessage("连接未建立。");
    return;
  }
  socket.send(JSON.stringify(payload));
}

function connectAndJoin(mode, code, spectator, isReconnect) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
  if (!isReconnect) {
    joinRequest = { mode, code, spectator };
  }
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`
  );

  socket.addEventListener("open", () => {
    if (mode === "create") {
      send({ type: "create" });
    } else {
      send({ type: "join", code, spectator });
    }
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "joined") {
      playerIndex = data.playerIndex;
      role = data.role || "player";
      roomCodeLabel.textContent = data.code;
      lastRoomCode = data.code;
      reconnectAttempts = 0;
      if (role === "spectator") {
        playerLabel.textContent = "观战";
        logMessage(`进入房间 ${data.code}（观战）。`);
      } else {
        const labelName = selfUser?.nickname || selfUser?.username || "";
        playerLabel.textContent = `玩家${playerIndex + 1}${labelName ? ` · ${labelName}` : ""}`;
        logMessage(`加入房间 ${data.code}。你是玩家${playerIndex + 1}。`);
      }
    }
    if (data.type === "state") {
      currentState = data.state;
      renderState();
    }
    if (data.type === "log") {
      logMessage(data.message, data.at);
    }
    if (data.type === "error") {
      logMessage(`错误: ${data.message}`);
    }
  });

  socket.addEventListener("close", () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000);
    reconnectAttempts += 1;
    logMessage(`连接已断开，${delay / 1000}s 后重连。`);
    reconnectTimer = setTimeout(() => {
      if (!joinRequest) {
        return;
      }
      const rejoinCode = lastRoomCode || joinRequest.code;
      const rejoinMode = rejoinCode ? "join" : joinRequest.mode;
      connectAndJoin(rejoinMode, rejoinCode, joinRequest.spectator, true);
    }, delay);
  });
}

lockSecretButton.addEventListener("click", () => {
  const digits = collectDigits(secretInputs);
  if (!digitsValid(digits)) {
    logMessage("秘密必须是四位数字 (0-9)。");
    return;
  }
  send({ type: "set_secret", digits });
});

submitGuessButton.addEventListener("click", () => {
  const digits = collectDigits(guessInputs);
  if (!digitsValid(digits)) {
    logMessage("猜测必须是四位数字 (0-9)。");
    return;
  }
  send({ type: "guess", digits });
  guessInputs.forEach((input) => {
    input.value = "";
  });
  guessInputs[0]?.focus();
});

rollDiceButton.addEventListener("click", () => {
  send({ type: "roll_dice" });
});

resetButton.addEventListener("click", () => {
  send({ type: "reset" });
});

logoutBtn.addEventListener("click", () => {
  logout();
});

autoAdvance(secretInputs);
autoAdvance(guessInputs);

async function init() {
  const user = await requireAuth();
  if (!user) {
    return;
  }
  selfUser = user;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const create = params.get("create");
  const spectator = params.get("spectator") === "1";
  if (create) {
    connectAndJoin("create");
  } else if (code) {
    connectAndJoin("join", code, spectator);
  } else {
    logMessage("缺少房间码，请返回大厅。");
  }
}

init();
