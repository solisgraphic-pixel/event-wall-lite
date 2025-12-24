const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
 
const app = express();
const server = http.createServer(app);
const io = new Server(server);
 
app.use(express.static("public"));
 
io.on("connection", (socket) => {
  socket.on("checkin", (payload) => {
    io.emit("wall", payload);
  });
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
