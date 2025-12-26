const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
 
const app = express();
const server = http.createServer(app);
const io = new Server(server);
 
app.use(express.static("public"));
 
// ===== 互動牆資料（server 端）=====
// 若你不需要存歷史留言，可以不使用 entries；但先保留以後好擴充
const entries = [];                 // 留言（可選：要不要保留歷史）
const participants = new Set();     // 一人一票（用「名字」去重）
 
function broadcastCount() {
  io.emit("participants_count", { count: participants.size });
}
 
// 抽 N 名（公平洗牌）
function pickWinners(n) {
  const arr = Array.from(participants);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}
 
io.on("connection", (socket) => {
  // 新連線：先送目前參與人數
  socket.emit("participants_count", { count: participants.size });
 
  // 收到留言/簽到
  socket.on("checkin", (p) => {
    const name = String(p?.name ?? "").trim();
    const message = String(p?.message ?? "").trim();
    const time = String(p?.time ?? "").trim();
    if (!name) return;
 
    // ✅ 一人一票：同名只算一次
    const before = participants.size;
    participants.add(name);
    if (participants.size !== before) broadcastCount();
 
    // （可選）存起來
    entries.push({ name, message, time });
 
    // ✅ 廣播留言到牆
    io.emit("wall", { name, message, time });
  });
 
  // 主持人抽獎：預設抽 3 名（也可傳 {n:3}）
  socket.on("host_draw", ({ n } = {}) => {
    const N = Math.max(1, Math.min(50, Number(n ?? 3) || 3));
    const winners = pickWinners(N);
    socket.emit("draw_result", {
      ok: true,
      winners,               // 例如 ["A","B","C"]
      total: participants.size
    });
  });
 
  // 主持人清空
  socket.on("host_reset", () => {
    participants.clear();
    entries.length = 0; // 如果你不想清留言，把這行刪掉
    broadcastCount();
    io.emit("host_reset_done");
  });
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
 
