const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ===== 資料（server 端）=====
const entries = []; // 留言歷史（可留可不留）
/**
 * participantsByKey:
 * key = `${tableNo}|${name}`
 * value = { token, tableNo, name, lastSeen }
 *
 * ✅ 去重規則：同桌號不能同名（同 key 只能一筆）
 */
const participantsByKey = new Map();

/**
 * participantsByToken:
 * token => { token, tableNo, name, lastSeen }
 * 用來判斷「同一支手機重送」時，允許更新訊息但不增加人數
 */
const participantsByToken = new Map();

function broadcastCount() {
  io.emit("participants_count", { count: participantsByKey.size });
}

// 抽 N 名（洗牌）
function pickWinners(n) {
  const arr = Array.from(participantsByKey.values()); // 內容是 {tableNo,name,...}
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length)).map(p => ({
    tableNo: p.tableNo,
    name: p.name
  }));
}

io.on("connection", (socket) => {
  socket.emit("participants_count", { count: participantsByKey.size });

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

    const key = `${tableNo}|${name}`;

    // ✅ 如果這個 token 之前已簽到（同手機重送）
    const prev = participantsByToken.get(token);
    if (prev) {
      const prevKey = `${prev.tableNo}|${prev.name}`;

      // 1) 同一個人同桌同名重送：允許（不增加人數）
      if (prevKey === key) {
        participantsByToken.set(token, { token, tableNo, name, lastSeen: Date.now() });

        entries.push({ token, tableNo, name, message, time });
        io.emit("wall", { tableNo, name, message, time });
        socket.emit("checkin_ok", { ok: true });
        return;
      }

      // 2) 同一個手機想改成別桌或別名：視同新參與者，但仍要遵守「同桌不可同名」
      //    （如果 key 已被別人佔用就擋）
    }

    // ✅ 同桌不可同名：同 key 已存在，且不是同手機同人重送 => 拒絕
    if (participantsByKey.has(key)) {
      socket.emit("checkin_error", {
        code: "DUP_NAME_SAME_TABLE",
        message: `桌號 ${tableNo} 已有人使用「${name}」，請換一個名字`
      });
      return;
    }

    // ✅ 通過：寫入 maps（人數 +1）
    participantsByToken.set(token, { token, tableNo, name, lastSeen: Date.now() });
    participantsByKey.set(key, { token, tableNo, name, lastSeen: Date.now() });
    broadcastCount();

    entries.push({ token, tableNo, name, message, time });
    io.emit("wall", { tableNo, name, message, time });

    socket.emit("checkin_ok", { ok: true });
  });

  // 主持人抽獎
  socket.on("host_draw", ({ n } = {}) => {
    const N = Math.max(1, Math.min(50, Number(n ?? 3) || 3));
    const winners = pickWinners(N);

    socket.emit("draw_result", {
      ok: true,
      winners, // [{tableNo,name},...]
      total: participantsByKey.size
    });
  });

  // 主持人清空（清掉整場資料）
  socket.on("host_reset", () => {
    participantsByKey.clear();
    participantsByToken.clear();
    entries.length = 0;
    broadcastCount();
    io.emit("host_reset_done");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
