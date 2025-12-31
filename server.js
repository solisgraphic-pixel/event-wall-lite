const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ===== 互動牆資料（server 端）=====
const entries = []; // 留言（可選：保留歷史）

// ✅ 用 token 去重：token -> { token, tableNo, name, lastSeen }
const participantsByToken = new Map();

function broadcastCount() {
  io.emit("participants_count", { count: participantsByToken.size });
}

// 抽 N 名（公平洗牌）
function pickWinners(n) {
  const arr = Array.from(participantsByToken.values()); // [{tableNo,name,...}, ...]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length)).map(p => ({
    tableNo: p.tableNo || "？",
    name: p.name || "？",
    token: p.token
  }));
}

io.on("connection", (socket) => {
  // 新連線：先送目前參與人數
  socket.emit("participants_count", { count: participantsByToken.size });

  // 收到留言/簽到
socket.on("checkin", (p) => {
  const token = String(p?.token ?? "").trim();
  const tableNo = String(p?.tableNo ?? "").trim();
  const name = String(p?.name ?? "").trim();
  const message = String(p?.message ?? "").trim();
  const time = String(p?.time ?? "").trim();

  if (!token) return;
  if (!tableNo) {
    socket.emit("checkin_error", { code: "NO_TABLE", message: "請先輸入桌號" });
    return;
  }
  if (!name) {
    socket.emit("checkin_error", { code: "NO_NAME", message: "請先輸入名字" });
    return;
  }

  // ✅ 同桌不可同名：桌號相同且名字相同 -> 拒絕
  const newKey = `${tableNo}|${name}`;
  for (const k of participantsByKey.keys()) {
    // k 格式是 "桌號|名字"
    if (k === newKey) {
      socket.emit("checkin_error", {
        code: "DUP_NAME_SAME_TABLE",
        message: `桌號 ${tableNo} 已有人使用「${name}」，請換一個名字`
      });
      return;
    }
  }

  // ===== 正常加入（雙層去重保留）=====
  const keyExisted = participantsByKey.has(newKey);
  participantsByToken.set(token, { token, tableNo, name, lastSeen: Date.now() });

  if (!keyExisted) {
    participantsByKey.set(newKey, { token, tableNo, name, lastSeen: Date.now() });
    broadcastCount();
  }

  entries.push({ token, tableNo, name, message, time });

  io.emit("wall", { tableNo, name, message, time });

  // 可選：回成功，讓前端知道可鎖定
  socket.emit("checkin_ok", { ok: true });
});

    if (!existed) broadcastCount();

    // （可選）存起來（現在也存 tableNo）
    entries.push({ token, tableNo, name, message, time });

    // ✅ 廣播留言到牆（帶 tableNo）
    io.emit("wall", { tableNo, name, message, time });
  });

  // 主持人抽獎：預設抽 3 名（也可傳 {n:3}）
  socket.on("host_draw", ({ n } = {}) => {
    const N = Math.max(1, Math.min(50, Number(n ?? 3) || 3));
    const winners = pickWinners(N);

    socket.emit("draw_result", {
      ok: true,
      winners, // ✅ [{tableNo,name,token}, ...]
      total: participantsByToken.size
    });
  });

  // 主持人清空
  socket.on("host_reset", () => {
    participantsByToken.clear();
    entries.length = 0; // 如果你不想清留言，把這行刪掉
    broadcastCount();
    io.emit("host_reset_done");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
