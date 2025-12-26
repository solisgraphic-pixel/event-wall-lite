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
const participants = new Set(); // 一人一票：用名字當 key（配合你手機端鎖名字）
const entries = [];             // 若你本來就有存留言，可保留你的版本
io.on("connection", (socket) => {
  // 讓新連線的人一進來就拿到目前參與人數
  socket.emit("participants_count", { count: participants.size });
 
  socket.on("checkin", (p) => {
    const name = String(p?.name ?? "").trim();
    const message = String(p?.message ?? "").trim();
    const time = String(p?.time ?? "").trim();
 
    if (!name) return;
 
    // ✅ 一人一票：同名只算一次
    if (!participants.has(name)) {
      participants.add(name);
      io.emit("participants_count", { count: participants.size });
    }
 
    // ✅ 廣播留言到牆
    io.emit("wall", { name, message, time });
  });
 
  // 主持人清空（如果你有清空按鈕）
  socket.on("host_reset", () => {
    participants.clear();
    // entries.length = 0; // 你如果有存留言/名單，視你的程式而定
    io.emit("participants_count", { count: 0 });
    io.emit("host_reset_done");
  });
});
 
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
