const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
 
const app = express();
const server = http.createServer(app);
const io = new Server(server);
 
app.use(express.static("public"));
// ===== 互動牆資料（server 端）=====
const entries = [];                 // 留言（可選：你要不要保留歷史）
const tokenToName = new Map();      // token -> 固定名字（第一次為準）
const participants = new Set();     // 一人一票（用 token 去重）
 
function broadcastCount(io){
  io.emit("participants_count", { count: participants.size });
}
 
function pickWinners(n){
  const arr = Array.from(participants);
 
  // 洗牌（公平）
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
 
  return arr.slice(0, Math.min(n, arr.length));
}
io.on("connection", (socket) => {
  socket.on("checkin", (payload) => {
    io.emit("wall", payload);
  });
 // 新連線：先把目前參與者人數給他（避免一直顯示 0）
socket.emit("participants_count", { count: participants.size });
 
/**
* 來賓送出簽到/留言
* 前端會送：{ token, name, message, time }
*/
socket.on("checkin", (p) => {
  const token = String(p?.token || "").trim();
  let name = String(p?.name || "").trim();
  const message = String(p?.message || "").trim() || "我已簽到";
  const time = String(p?.time || "").trim() || "";
 
  if (!token || !name) return;
 
  // ✅ 名字鎖定：同 token 第一次名字為準
  if (!tokenToName.has(token)) {
    tokenToName.set(token, name);
  } else {
    name = tokenToName.get(token);
  }
 
  // ✅ 一人一票：token 去重
  const before = participants.size;
  participants.add(token);
  if (participants.size !== before) broadcastCount(io);
 
  // ✅ 留言牆
  const entry = { name, message, time };
  entries.push(entry);
  io.emit("wall", entry);
});
 
/**
* 主持人抽獎：抽 N 名（預設 3）
* 前端會送：{ n: 3 }
*/
socket.on("host_draw", (payload) => {
  const n = Math.max(1, Math.min(20, Number(payload?.n || 3)));
 
  if (participants.size === 0) {
    io.emit("draw_result", { ok: false, reason: "目前尚無參與者" });
    return;
  }
 
  const winnerTokens = pickWinners(n);
  const winners = winnerTokens.map(t => tokenToName.get(t) || "（未知）");
 
  io.emit("draw_result", {
    ok: true,
    winners,
    total: participants.size
  });
});
 
/**
* 主持人清空名單/留言
*/
socket.on("host_reset", () => {
  entries.length = 0;
  tokenToName.clear();
  participants.clear();
  broadcastCount(io);
  io.emit("host_reset_done", { ok: true });
});
 
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
