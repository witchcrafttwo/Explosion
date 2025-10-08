import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

import { GameRoom } from "./gameRoom.js";
import { TICK_RATE } from "./gameConstants.js";

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(__dirname, "../client");

const app = express();
app.use(express.static(clientPath));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/game" });

const rooms = new Map();

function findAvailableRoom() {
  for (const room of rooms.values()) {
    if (room.players.size < 2) {
      return room;
    }
  }
  const roomId = `R-${(rooms.size + 1).toString().padStart(3, "0")}`;
  const room = new GameRoom(roomId);
  rooms.set(roomId, room);
  return room;
}

wss.on("connection", (ws) => {
  const connection = {
    id: uuid(),
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
  };

  const room = findAvailableRoom();
  room.addPlayer(connection);
  connection.roomId = room.id;

  const welcomePayload = { playerId: connection.id, roomId: room.id };
  connection.send(JSON.stringify({ type: "welcome", payload: welcomePayload }));
  connection.send(JSON.stringify({ type: "state", payload: room.serialize() }));
  room.broadcast({ type: "matchmaking", payload: { waiting: room.players.size < 2 } });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      console.warn("Invalid JSON from client", error);
      return;
    }

    switch (message.type) {
      case "input":
        room.handleInput(connection.id, message.payload || {});
        break;
      case "skill":
        room.handleSkill(connection.id);
        break;
      case "restart":
        room.handleRestart(connection.id);
        break;
      default:
        console.warn("Unknown message type", message.type);
    }
  });

  ws.on("close", () => {
    room.removePlayer(connection.id);
    if (room.players.size === 0) {
      rooms.delete(room.id);
    }
  });
});

setInterval(() => {
  rooms.forEach((room) => room.update());
}, 1000 / TICK_RATE);

httpServer.listen(PORT, () => {
  console.log(`ドッカン戦車バトル Online サーバー起動: http://localhost:${PORT}`);
});
